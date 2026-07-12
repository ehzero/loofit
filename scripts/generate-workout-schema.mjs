#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = resolve(ROOT, 'contracts/workout-schema.json');
const TYPESCRIPT_OUTPUT = resolve(ROOT, 'src/db/generated/workout-schema.generated.ts');
const SWIFT_OUTPUT = resolve(
  ROOT,
  'modules/loofit-workout-core/ios/LoofitWorkoutSchema.generated.swift'
);
const CHECK_MODE = process.argv.includes('--check');

const contract = JSON.parse(await readFile(CONTRACT_PATH, 'utf8'));
validateContract(contract);

const migrationSteps = buildMigrationSteps(contract);
const latestSchemaSQL = schemaSQL(contract.database.version);

const outputs = new Map([
  [TYPESCRIPT_OUTPUT, renderTypeScript()],
  [SWIFT_OUTPUT, renderSwift()],
]);

let stale = false;
for (const [path, expected] of outputs) {
  if (CHECK_MODE) {
    const actual = await readFile(path, 'utf8').catch(() => null);
    if (actual !== expected) {
      stale = true;
      console.error(`Generated schema is stale: ${path}`);
    }
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected);
    console.log(`Generated ${path}`);
  }
}

if (CHECK_MODE) {
  await verifySyntheticFutureMigrationOrdering();
}

if (stale) {
  console.error('Run `npm run schema:generate` and commit the generated files.');
  process.exitCode = 1;
}

function validateContract(value) {
  const identifier = /^[a-z][a-z0-9_]*$/;
  assert(Number.isInteger(value.database?.version) && value.database.version > 0, 'Invalid version');
  assert(typeof value.database?.name === 'string' && value.database.name.length > 0, 'Invalid name');
  const tableNames = new Set();
  for (const table of value.tables ?? []) {
    assert(identifier.test(table.name), `Invalid table name: ${table.name}`);
    assert(!tableNames.has(table.name), `Duplicate table: ${table.name}`);
    tableNames.add(table.name);
    assert(validVersion(table.sinceVersion), `Invalid table version: ${table.name}`);
    const columnNames = new Set();
    for (const column of table.columns ?? []) {
      assert(identifier.test(column.name), `Invalid column name: ${table.name}.${column.name}`);
      assert(!columnNames.has(column.name), `Duplicate column: ${table.name}.${column.name}`);
      columnNames.add(column.name);
      assert(validVersion(column.sinceVersion), `Invalid column version: ${table.name}.${column.name}`);
      assert(column.sinceVersion >= table.sinceVersion, `Column predates table: ${table.name}.${column.name}`);
      assert(typeof column.definition === 'string' && column.definition.length > 0, `Missing definition: ${table.name}.${column.name}`);
    }
  }

  assert(tableNames.has(value.widgetSync?.stateTable), 'Missing widget sync state table');
  for (const table of value.widgetSync?.trackedTables ?? []) {
    assert(tableNames.has(table), `Unknown widget sync table: ${table}`);
  }
  for (const operation of value.widgetSync?.operations ?? []) {
    assert(['INSERT', 'UPDATE', 'DELETE'].includes(operation), `Invalid trigger operation: ${operation}`);
  }

  const indexNames = new Set();
  for (const index of value.indexes ?? []) {
    assert(identifier.test(index.name), `Invalid index name: ${index.name}`);
    assert(!indexNames.has(index.name), `Duplicate index: ${index.name}`);
    indexNames.add(index.name);
    const table = tableNamed(index.table, value);
    assert(validVersion(index.sinceVersion), `Invalid index version: ${index.name}`);
    for (const column of index.columns ?? []) {
      assert(table.columns.some((candidate) => candidate.name === column), `Unknown index column: ${index.name}.${column}`);
    }
  }

  const migrations = value.migrations ?? [];
  assert(
    migrations.length === value.database.version,
    'Migrations must contain exactly one ordered step for every schema version'
  );

  const migrationIds = new Set();
  const migrationVersions = new Set();
  for (const [index, migration] of migrations.entries()) {
    const expectedVersion = index + 1;
    assert(identifier.test(migration.id), `Invalid migration id: ${migration.id}`);
    assert(!migrationIds.has(migration.id), `Duplicate migration id: ${migration.id}`);
    migrationIds.add(migration.id);
    assert(
      migration.version === expectedVersion,
      `Migration ${migration.id} must be version ${expectedVersion}, received ${migration.version}`
    );
    migrationVersions.add(migration.version);
    if (migration.afterSql !== undefined) {
      assert(
        Array.isArray(migration.afterSql) && migration.afterSql.length > 0,
        `Migration ${migration.id} has empty afterSql`
      );
    }
  }

  for (const table of value.tables) {
    assert(
      migrationVersions.has(table.sinceVersion),
      `Table ${table.name} has no migration step for version ${table.sinceVersion}`
    );
    for (const column of table.columns) {
      assert(
        migrationVersions.has(column.sinceVersion),
        `Column ${table.name}.${column.name} has no migration step for version ${column.sinceVersion}`
      );
    }
  }
  for (const index of value.indexes) {
    assert(
      migrationVersions.has(index.sinceVersion),
      `Index ${index.name} has no migration step for version ${index.sinceVersion}`
    );
  }
  function validVersion(version) {
    return Number.isInteger(version) && version > 0 && version <= value.database.version;
  }
}

function buildMigrationSteps(source) {
  return source.migrations.map((migration) => createMigrationStep(migration, source));
}

function createMigrationStep(migration, source) {
  const version = migration.version;
  const columns = source.tables.flatMap((table) =>
    table.sinceVersion < version
      ? table.columns
          .filter((column) => column.sinceVersion === version)
          .map((column) => ({
            table: table.name,
            column: column.name,
            definition: column.definition,
          }))
      : []
  );
  const phases = migrationSQLPhases(version, source);
  return {
    id: migration.id,
    version,
    schemaSQL: phases.schemaSQL,
    columns,
    postSchemaSQL: phases.postSchemaSQL,
    afterSQL: migration.afterSql?.join('\n') ?? null,
  };
}

function migrationSQLPhases(version, source) {
  const preSections = source.tables
    .filter((table) => table.sinceVersion === version)
    .map((table) => createTableSQL(table, version));
  const postSections = [];
  const widgetSyncStateVersion = tableNamed(source.widgetSync.stateTable, source).sinceVersion;
  if (widgetSyncStateVersion <= version) {
    preSections.push(widgetSyncSeedSQL(source));
  }
  for (const index of source.indexes.filter((candidate) => candidate.sinceVersion === version)) {
    if (index.beforeCreateSql?.length) {
      postSections.push(index.beforeCreateSql.join('\n'));
    }
    postSections.push(createIndexSQL(index));
  }
  if (widgetSyncStateVersion <= version) {
    postSections.push(widgetSyncTriggerSQL(version, true, source));
  }
  return {
    schemaSQL: preSections.length > 0 ? `${preSections.join('\n\n')}\n` : '',
    postSchemaSQL: postSections.length > 0 ? `${postSections.join('\n\n')}\n` : '',
  };
}

function schemaSQL(version, source = contract) {
  const tables = source.tables.filter((table) => table.sinceVersion <= version);
  const sections = tables.map((table) => createTableSQL(table, version));
  if (tableNamed(source.widgetSync.stateTable, source).sinceVersion <= version) {
    sections.push(widgetSyncSeedSQL(source));
  }
  for (const index of source.indexes.filter((candidate) => candidate.sinceVersion <= version)) {
    if (index.beforeCreateSql?.length) {
      sections.push(index.beforeCreateSql.join('\n'));
    }
    sections.push(createIndexSQL(index));
  }
  if (tableNamed(source.widgetSync.stateTable, source).sinceVersion <= version) {
    sections.push(widgetSyncTriggerSQL(version, false, source));
  }
  return `${sections.join('\n\n')}\n`;
}

function createTableSQL(table, version) {
  const columns = table.columns
    .filter((column) => column.sinceVersion <= version)
    .map((column) => `  ${column.name} ${column.definition}`)
    .join(',\n');
  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n${columns}\n);`;
}

function createIndexSQL(index) {
  const unique = index.unique ? 'UNIQUE ' : '';
  const where = index.where ? `\n  WHERE ${index.where}` : '';
  return `CREATE ${unique}INDEX IF NOT EXISTS ${index.name}\n  ON ${index.table}(${index.columns.join(', ')})${where};`;
}

function widgetSyncSeedSQL(source = contract) {
  const sync = source.widgetSync;
  return [
    `INSERT OR IGNORE INTO ${sync.stateTable}`,
    '  (id, desired_revision, published_revision, last_error, updated_at)',
    'VALUES',
    `  (${sync.singletonId}, ${sync.initialDesiredRevision}, ${sync.initialPublishedRevision}, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`,
  ].join('\n');
}

function widgetSyncTriggerSQL(version, replaceExisting, source = contract) {
  const stateTable = source.widgetSync.stateTable;
  const trackedTables = source.widgetSync.trackedTables.filter(
    (table) => tableNamed(table, source).sinceVersion <= version
  );
  return trackedTables
    .flatMap((table) =>
      source.widgetSync.operations.map((operation) => {
        const trigger = `widget_sync_${table}_${operation.toLowerCase()}`;
        const statements = [
          `CREATE TRIGGER IF NOT EXISTS ${trigger}`,
          `AFTER ${operation} ON ${table}`,
          'BEGIN',
          `  UPDATE ${stateTable}`,
          '  SET desired_revision = desired_revision + 1,',
          "      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
          `  WHERE id = ${source.widgetSync.singletonId};`,
          'END;',
        ];
        if (replaceExisting) {
          statements.unshift(`DROP TRIGGER IF EXISTS ${trigger};`);
        }
        return statements.join('\n');
      })
    )
    .join('\n');
}

async function verifySyntheticFutureMigrationOrdering() {
  const synthetic = structuredClone(contract);
  const futureVersion = synthetic.database.version + 1;
  const columnName = 'synthetic_indexed_value';
  const indexName = 'idx_sessions_synthetic_indexed_value';
  synthetic.database.version = futureVersion;
  synthetic.migrations.push({
    id: 'synthetic_indexed_column',
    version: futureVersion,
  });
  const sessionsTable = tableNamed('workout_sessions', synthetic);
  sessionsTable.columns.push({
    name: columnName,
    definition: 'INTEGER NOT NULL DEFAULT 0',
    sinceVersion: futureVersion,
  });
  synthetic.indexes.push({
    name: indexName,
    table: sessionsTable.name,
    columns: [columnName],
    sinceVersion: futureVersion,
  });

  validateContract(synthetic);
  const steps = buildMigrationSteps(synthetic);
  const futureStep = steps.find((step) => step.version === futureVersion);
  assert(futureStep, 'Synthetic future migration step was not generated');
  assert(
    futureStep.columns.some(
      (column) => column.table === sessionsTable.name && column.column === columnName
    ),
    'Synthetic future column was not generated as an ALTER operation'
  );
  assert(
    futureStep.schemaSQL.includes(indexName) === false,
    'Same-version index must not be emitted before column ALTER operations'
  );
  assert(
    futureStep.postSchemaSQL.includes(indexName),
    'Same-version index must be emitted in postSchemaSQL'
  );

  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(':memory:');
  try {
    for (const step of steps) {
      if (step.schemaSQL.trim()) {
        database.exec(step.schemaSQL);
      }
      for (const column of step.columns) {
        const existingColumns = database
          .prepare(`PRAGMA table_info(${column.table})`)
          .all();
        if (!existingColumns.some((existing) => existing.name === column.column)) {
          database.exec(
            `ALTER TABLE ${column.table} ADD COLUMN ${column.column} ${column.definition}`
          );
        }
      }
      if (step.postSchemaSQL.trim()) {
        database.exec(step.postSchemaSQL);
      }
      if (step.afterSQL?.trim()) {
        database.exec(step.afterSQL);
      }
      database.exec(`PRAGMA user_version = ${step.version}`);
    }
    const indexRow = database
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get(indexName);
    assert(indexRow?.count === 1, 'Synthetic same-version column index was not created');
  } finally {
    database.close();
  }
}

function renderTypeScript() {
  return [
    '// Generated by scripts/generate-workout-schema.mjs from contracts/workout-schema.json.',
    '// Do not edit this file directly.',
    '',
    'export type DatabaseSchemaColumnMigration = Readonly<{',
    '  table: string;',
    '  column: string;',
    '  definition: string;',
    '}>;',
    '',
    'export type DatabaseSchemaMigrationStep = Readonly<{',
    '  id: string;',
    '  version: number;',
    '  schemaSql: string;',
    '  columns: readonly DatabaseSchemaColumnMigration[];',
    '  postSchemaSql: string;',
    '  afterSql: string | null;',
    '}>;',
    '',
    `export const DATABASE_NAME = ${JSON.stringify(contract.database.name)};`,
    `export const DATABASE_VERSION = ${contract.database.version};`,
    `export const DATABASE_MIGRATIONS: readonly DatabaseSchemaMigrationStep[] = ${renderTypeScriptMigrationSteps()};`,
    '',
    `export const MIGRATION_SQL = ${renderTsTemplate(latestSchemaSQL)};`,
    '',
  ].join('\n');
}

function renderSwift() {
  return [
    '// Generated by scripts/generate-workout-schema.mjs from contracts/workout-schema.json.',
    '// Do not edit this file directly.',
    '',
    'import Foundation',
    '',
    'struct LoofitWorkoutSchemaColumnMigration {',
    '  let table: String',
    '  let column: String',
    '  let definition: String',
    '}',
    '',
    'struct LoofitWorkoutSchemaMigrationStep {',
    '  let id: String',
    '  let version: Int',
    '  let schemaSQL: String',
    '  let columns: [LoofitWorkoutSchemaColumnMigration]',
    '  let postSchemaSQL: String',
    '  let afterSQL: String?',
    '}',
    '',
    'enum LoofitWorkoutSchemaContract {',
    `  static let databaseName = ${JSON.stringify(contract.database.name)}`,
    `  static let currentVersion = ${contract.database.version}`,
    `  static let migrations: [LoofitWorkoutSchemaMigrationStep] = ${renderSwiftMigrationSteps()}`,
    `  static let widgetSyncStateTable = ${JSON.stringify(contract.widgetSync.stateTable)}`,
    '}',
    '',
  ].join('\n');
}

function renderTypeScriptMigrationSteps() {
  const steps = migrationSteps.map((step) => {
    const columns = renderTypeScriptMigrationColumns(step.columns);
    const afterSql = step.afterSQL === null ? 'null' : renderTsTemplate(step.afterSQL);
    return [
      '  {',
      `    id: ${JSON.stringify(step.id)},`,
      `    version: ${step.version},`,
      `    schemaSql: ${renderTsTemplate(step.schemaSQL)},`,
      `    columns: ${columns},`,
      `    postSchemaSql: ${renderTsTemplate(step.postSchemaSQL)},`,
      `    afterSql: ${afterSql},`,
      '  },',
    ].join('\n');
  });
  return `[\n${steps.join('\n')}\n]`;
}

function renderTypeScriptMigrationColumns(columns) {
  if (columns.length === 0) {
    return '[]';
  }
  return `[\n${columns
    .map(
      (column) =>
        `      { table: ${JSON.stringify(column.table)}, column: ${JSON.stringify(column.column)}, definition: ${JSON.stringify(column.definition)} },`
    )
    .join('\n')}\n    ]`;
}

function renderSwiftMigrationSteps() {
  const steps = migrationSteps.map((step) => {
    const afterSQL = step.afterSQL === null ? 'nil' : renderSwiftMultiline(step.afterSQL);
    return [
      '    LoofitWorkoutSchemaMigrationStep(',
      `      id: ${JSON.stringify(step.id)},`,
      `      version: ${step.version},`,
      `      schemaSQL: ${renderSwiftMultiline(step.schemaSQL)},`,
      `      columns: ${renderSwiftMigrationColumns(step.columns)},`,
      `      postSchemaSQL: ${renderSwiftMultiline(step.postSchemaSQL)},`,
      `      afterSQL: ${afterSQL}`,
      '    ),',
    ].join('\n');
  });
  return `[\n${steps.join('\n')}\n  ]`;
}

function renderSwiftMigrationColumns(columns) {
  if (columns.length === 0) {
    return '[]';
  }
  return `[\n${columns
    .map(
      (column) =>
        `        LoofitWorkoutSchemaColumnMigration(table: ${JSON.stringify(column.table)}, column: ${JSON.stringify(column.column)}, definition: ${JSON.stringify(column.definition)}),`
    )
    .join('\n')}\n      ]`;
}

function renderTsTemplate(value) {
  return `\`\n${value.replaceAll('`', '\\`').replaceAll('${', '\\${')}\``;
}

function renderSwiftMultiline(value) {
  assert(!value.includes('"""'), 'Swift multiline string cannot contain a triple quote');
  return `"""\n${value}\n"""`;
}

function tableNamed(name, source = contract) {
  const table = source.tables.find((candidate) => candidate.name === name);
  assert(table, `Unknown table: ${name}`);
  return table;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invalid workout schema contract: ${message}`);
  }
}

// Database structure and cross-runtime migration constants are generated from
// contracts/workout-schema.json. Keep product seed data in this handwritten
// module, but change tables, columns, indexes, or sync triggers in the contract.
export {
  DATABASE_MIGRATIONS,
  DATABASE_NAME,
  DATABASE_VERSION,
  MIGRATION_SQL,
} from './generated/workout-schema.generated';

export const DEFAULT_BODY_PARTS = [
  { name: '가슴', color: '#E84A5F' },
  { name: '등', color: '#2A9D8F' },
  { name: '하체', color: '#F4A261' },
  { name: '어깨', color: '#6C63FF' },
  { name: '팔', color: '#457B9D' },
  { name: '삼두', color: '#F77F00' },
  { name: '이두', color: '#0077B6' },
  { name: '유산소', color: '#43AA8B' },
  { name: '상체', color: '#D62828' },
  { name: '푸시', color: '#9B5DE5' },
  { name: '풀', color: '#00A6FB' },
  { name: '코어', color: '#FFB703' },
  { name: '기타', color: '#6C757D' },
] as const;

export type MutationTicket = {
  kind: 'mutation';
  mutationRevision: number;
};

export type RefreshTicket = {
  kind: 'refresh';
  mutationRevision: number;
  refreshRevision: number;
};

/**
 * Coordinates app-originated reads and writes without making an old overview
 * response authoritative after a newer request has started.
 *
 * App-originated SQLite access and native Core operations routed through this
 * coordinator share one serial pipeline. Tickets additionally prevent a
 * queued refresh from making stale state authoritative after a newer mutation
 * was requested.
 */
export class AppOperationCoordinator {
  private mutationRevision = 0;
  private refreshRevision = 0;
  private latestSuccessfulRefreshRevision = 0;
  private pipelineTail: Promise<void> = Promise.resolve();

  beginMutation(): MutationTicket {
    this.mutationRevision += 1;
    this.latestSuccessfulRefreshRevision = 0;
    return { kind: 'mutation', mutationRevision: this.mutationRevision };
  }

  beginRefresh(): RefreshTicket {
    this.refreshRevision += 1;
    return {
      kind: 'refresh',
      mutationRevision: this.mutationRevision,
      refreshRevision: this.refreshRevision,
    };
  }

  isCurrent(ticket: MutationTicket | RefreshTicket): boolean {
    if (ticket.kind === 'mutation') {
      return ticket.mutationRevision === this.mutationRevision;
    }
    return (
      ticket.mutationRevision === this.mutationRevision &&
      ticket.refreshRevision === this.refreshRevision
    );
  }

  acceptRefreshSuccess(ticket: RefreshTicket): boolean {
    if (
      ticket.mutationRevision !== this.mutationRevision ||
      ticket.refreshRevision < this.latestSuccessfulRefreshRevision
    ) {
      return false;
    }
    this.latestSuccessfulRefreshRevision = ticket.refreshRevision;
    return true;
  }

  isLatestSuccessfulRefresh(ticket: RefreshTicket): boolean {
    return (
      ticket.mutationRevision === this.mutationRevision &&
      ticket.refreshRevision === this.latestSuccessfulRefreshRevision
    );
  }

  runInPipeline<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pipelineTail.then(operation, operation);
    this.pipelineTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

export const appOperationCoordinator = new AppOperationCoordinator();

import { kvs, WhereConditions } from '@forge/kvs';
import type { IssueLink, JiraConfig } from '../domain/types';
import { RiskBusyError, type IssueLinkRepository } from './issue-links';
import { LockHeldError, withKvsLock } from './kvs-lock';

const CONFIG_KEY = 'cfg:jira';
const LINK_PREFIX = 'lnk:';
const LOCK_PREFIX = 'lnklock:';
const PAGE_SIZE = 100;
const BATCH_SIZE = 20;

const encode = (part: string) => Buffer.from(part, 'utf8').toString('base64url');

export class KvsIssueLinkRepository implements IssueLinkRepository {
  async getConfig(): Promise<JiraConfig | null> {
    return (await kvs.get<JiraConfig>(CONFIG_KEY)) ?? null;
  }

  async saveConfig(config: JiraConfig): Promise<void> {
    await kvs.set(CONFIG_KEY, config);
  }

  async getLink(riskId: string): Promise<IssueLink | null> {
    return (await kvs.get<IssueLink>(`${LINK_PREFIX}${encode(riskId)}`)) ?? null;
  }

  async listLinks(): Promise<IssueLink[]> {
    const out: IssueLink[] = [];
    let cursor: string | undefined;
    do {
      let query = kvs.query().where('key', WhereConditions.beginsWith(LINK_PREFIX)).limit(PAGE_SIZE);
      if (cursor) query = query.cursor(cursor);
      const page = await query.getMany<IssueLink>();
      out.push(...page.results.map((r) => r.value));
      cursor = page.nextCursor;
    } while (cursor);
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveLink(link: IssueLink): Promise<void> {
    await kvs.set(`${LINK_PREFIX}${encode(link.riskId)}`, link);
  }

  async clearLinks(): Promise<void> {
    const keys = (await this.listLinks()).map((l) => ({ key: `${LINK_PREFIX}${encode(l.riskId)}` }));
    for (let i = 0; i < keys.length; i += BATCH_SIZE) await kvs.batchDelete(keys.slice(i, i + BATCH_SIZE));
  }

  async withRiskLock<T>(riskId: string, fn: () => Promise<T>): Promise<T> {
    try {
      // 2 minutes comfortably covers a Jira create call plus the link write.
      return await withKvsLock(`${LOCK_PREFIX}${encode(riskId)}`, 2, fn);
    } catch (err) {
      throw err instanceof LockHeldError ? new RiskBusyError() : err;
    }
  }
}

import { Database } from "@db/sqlite";
import * as insightsTable from "$tables/insights.ts";
import type { HasDBClient } from "./shared.ts";
import { afterAll, beforeAll } from "@std/testing/bdd";

type Fixture = HasDBClient & {
  insights: {
    insert(insights: insightsTable.Insert[]): void;
    selectAll(): insightsTable.Row[];
  };
};

export const withDB = <R>(fn: (fixture: Fixture) => R): R => {
  const db = new Database(":memory:");

  beforeAll(() => {
    db.exec(insightsTable.createTable);
  });

  afterAll(() => db.close());

  return fn({
    db,
    insights: {
      selectAll() {
        return db.sql<insightsTable.Row>`SELECT * FROM insights`;
      },
      insert(insights) {
        for (const item of insights) {
          db.exec(insightsTable.insertStatement(item));
        }
      },
    },
  });
};

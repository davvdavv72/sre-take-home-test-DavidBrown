import { useEffect, useState } from "react";
import { Header } from "../components/header/header.tsx";
import { Insights } from "../components/insights/insights.tsx";
// @ts-types="../types/css-module.d.ts"
import styles from "./app.module.css";
import type { Insight } from "../schemas/insight.ts";

export const App = () => {
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    fetch(`/api/insights`).then((res) => res.json()).then(setInsights);
  }, []);

  return (
    <main className={styles.main}>
      <Header />
      <Insights className={styles.insights} insights={insights} />
    </main>
  );
};

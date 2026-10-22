import { BRANDS } from "../../lib/consts.ts";
import { Button } from "../button/button.tsx";
import { Modal, type ModalProps } from "../modal/modal.tsx";
// @ts-types="../../types/css-module.d.ts"
import styles from "./add-insight.module.css";

type AddInsightProps = ModalProps;

export const AddInsight = (props: AddInsightProps) => {
  const addInsight = () => undefined;

  return (
    <Modal {...props}>
      <h1 className={styles.heading}>Add a new insight</h1>
      <form className={styles.form} onSubmit={addInsight}>
        <label className={styles.field}>
          <select className={styles["field-input"]}>
            {BRANDS.map(({ id, name }) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Insight
          <textarea
            className={styles["field-input"]}
            rows={5}
            placeholder="Something insightful..."
          />
        </label>
        <Button className={styles.submit} type="submit" label="Add insight" />
      </form>
    </Modal>
  );
};

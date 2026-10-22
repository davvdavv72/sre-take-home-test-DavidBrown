import type { ComponentProps } from "react";
import { cx } from "../../lib/cx.ts";
// @ts-types="../../types/css-module.d.ts"
import styles from "./button.module.css";

type ButtonProps = {
  /** Label for the button */
  label: string;
  /** Theme of the button */
  theme?: "primary" | "secondary";
} & ComponentProps<"button">;

export const Button = ({
  label,
  theme = "primary",
  className,
  ...props
}: ButtonProps) => {
  return (
    <button className={cx(styles.button, styles[theme], className)} {...props}>
      {label}
    </button>
  );
};

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../lib/cx.ts";
// @ts-types="../../types/css-module.d.ts"
import styles from "./modal.module.css";

export type ModalProps = {
  /** Whether modal is open */
  open: boolean;
  /** Callback when modal closes */
  onClose(): void;
  /** Content of the modal */
  children?: ReactNode;
};

const ANIMATIONS = {
  overlay: {
    closed: { opacity: 0 },
    open: {
      opacity: 1,
      transition: {
        delayChildren: 0.1,
      },
    },
  },
  modal: {
    closed: { opacity: 0, y: 20 },
    open: { opacity: 1, y: 0 },
  },
};

/**
 * @component
 * Modal that opens in a portal
 */
export const Modal = ({ open, onClose, children }: ModalProps) => {
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <LayoutGroup>
          <motion.div
            className={styles.overlay}
            variants={ANIMATIONS.overlay}
            initial="closed"
            animate="open"
            exit="closed"
            onClick={onClose}
            data-testid="overlay"
          >
            <motion.div
              className={cx(styles.modal)}
              variants={ANIMATIONS.modal}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <XIcon className={styles.close} onClick={onClose} />

              <div className={cx(styles.content)}>{children}</div>
            </motion.div>
          </motion.div>
        </LayoutGroup>
      )}
    </AnimatePresence>,
    document.body,
  );
};

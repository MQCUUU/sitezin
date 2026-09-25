"use client";

import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

import { cx } from "./cx";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ invalid, className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cx("mc-field", "mc-textarea", "mc-focusable", className)}
        data-invalid={invalid || undefined}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  }
);

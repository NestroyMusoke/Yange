import { Fragment } from "react";

interface YangeWordmarkProps {
  className?: string;
  children?: string;
}

export function YangeWordmark({ className = "", children = "Yange" }: YangeWordmarkProps) {
  return (
    <span className={`yange-wordmark ${className}`.trim()}>{children}</span>
  );
}

export function YangeText({ children }: { children: string }) {
  return (
    <>
      {children.split(/(Yange)/gi).map((part, index) => (
        /^yange$/i.test(part)
          ? <YangeWordmark key={`${part}-${index}`}>{part}</YangeWordmark>
          : <Fragment key={`${part}-${index}`}>{part}</Fragment>
      ))}
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const localizedLabels = {
  en: {
    title: "Something went wrong",
    description: "Please try again or return home.",
    retry: "Retry",
    home: "Home",
  },
  "zh-CN": {
    title: "页面暂时无法打开",
    description: "请重试或返回首页。",
    retry: "重试",
    home: "返回首页",
  },
} as const;

export default function ErrorPage({ error: _error, reset }: ErrorPageProps) {
  const pathname = usePathname();
  const locale = pathname.startsWith("/zh-CN") ? "zh-CN" : "en";
  const labels = localizedLabels[locale];

  return (
    <main className="route-error" role="alert">
      <h1>{labels.title}</h1>
      <p>{labels.description}</p>
      <div className="route-error-actions">
        <button onClick={reset} type="button">
          {labels.retry}
        </button>
        <Link href={`/${locale}`}>{labels.home}</Link>
      </div>
    </main>
  );
}

"use client";
import * as React from "react";
import Link from "next/link";
import { smsRecoveryClient } from "@/infrastructure/identity/sms-recovery-client";
export function SmsRecoveryEntry() {
  const [enabled, setEnabled] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    smsRecoveryClient
      .status()
      .then((status) => {
        if (live) setEnabled(status.enabled);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return enabled ? (
    <Link
      className="mt-4 block text-center text-sm text-primary underline"
      href="/phone-password-recovery"
    >
      Şifremi unuttum — SMS ile sıfırla
    </Link>
  ) : null;
}

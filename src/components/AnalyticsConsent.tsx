import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, X } from "lucide-react";
import { denyAnalyticsConsent, grantAnalyticsConsent } from "@/lib/posthog";
import { clearTelemetryState, track } from "@/lib/telemetry";

const CONSENT_KEY = "edusphere-analytics-consent";

/** A single, explicit choice for both first-party metrics and PostHog. */
export default function AnalyticsConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(CONSENT_KEY) === null);
  }, []);

  const allow = () => {
    grantAnalyticsConsent();
    track("analytics_consent_granted");
    setVisible(false);
  };

  const decline = () => {
    denyAnalyticsConsent();
    clearTelemetryState();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <section className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-xl rounded-2xl border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-xl sm:inset-x-6 sm:p-5" aria-label="Analytics preference">
      <div className="flex gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BarChart3 className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold text-foreground">Help improve EduSphere?</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            With your permission, we collect limited product-use events. We never send file numbers, OTPs, phone numbers, uploaded files, or form contents to analytics. <Link className="text-primary underline underline-offset-4" to="/privacy">Learn more</Link>.
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={decline} className="btn-ghost min-h-11 px-4 text-sm">Only essential</button>
            <button type="button" onClick={allow} className="btn-primary min-h-11 px-4 text-sm">Allow analytics</button>
          </div>
        </div>
        <button type="button" onClick={decline} className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Use essential services only">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

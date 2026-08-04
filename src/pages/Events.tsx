import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Calendar, Clock, MapPin, ChevronRight, ArrowRight, Tag } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/store/appStore";
import { getEvents } from "@/services/events";

// Local shape adapted from the events Supabase row (see Sessions.tsx for the
// same DB-row -> UI-shape adaptation pattern). The events table has no
// snake_case fields, so this is a 1:1 field carry-over minus timestamps.
interface EventCardData {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  tag: string;
  description: string;
  type: "upcoming" | "past";
}

// Palette rule: warm caution hues are excluded from this system entirely —
// dark surfaces + red (primary) + green (secondary), with a lighter red
// step (red-300) as the deliberate third accent. Cultural takes that
// red-300 accent directly; Sports would collide with it at the same step,
// so it falls back to green-400 (distinct from Networking's `secondary`
// token) rather than a second red shade, per the two options given for
// resolving that collision.
const tagColors: Record<string, string> = {
  Science: "bg-blue-500/15 text-blue-300",
  Workshop: "bg-purple-500/15 text-purple-300",
  Cultural: "bg-red-300/15 text-red-300",
  Tech: "bg-cyan-500/15 text-cyan-300",
  Academic: "bg-primary/15 text-primary",
  Networking: "bg-secondary/15 text-secondary",
  // Slate, not a second purple — Workshop already owns purple-300, and two
  // adjacent purples would read as the same category at a glance.
  Lecture: "bg-slate-500/15 text-slate-300",
  Sports: "bg-green-400/15 text-green-400",
  Art: "bg-pink-500/15 text-pink-300",
};

function EventCard({ event, featured = false, language }: { event: EventCardData; featured?: boolean; language: string }) {
  const isUpcoming = event.type === "upcoming";

  const handleRegister = () => {
    toast.success(
      language === "fr"
        ? `Inscription confirmée pour "${event.title}"`
        : `Registered for "${event.title}" successfully`
    );
  };

  if (featured) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface-raised relative overflow-hidden"
      >
        {/* Left colored strip */}
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isUpcoming ? "bg-gradient-red" : "bg-gradient-green"}`} />

        <div className="pl-8 pr-6 py-6 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${tagColors[event.tag] ?? "bg-muted text-muted-foreground"}`}>
                <span className="flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  {event.tag}
                </span>
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isUpcoming
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}>
                {isUpcoming
                  ? (language === "fr" ? "A venir" : "Upcoming")
                  : (language === "fr" ? "Passé" : "Past")}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-secondary/10 text-secondary text-xs font-semibold">
                {language === "fr" ? "Événement vedette" : "Featured Event"}
              </span>
            </div>

            <h2 className="font-display font-extrabold text-2xl text-foreground mb-2">{event.title}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">{event.description}</p>

            <div className="flex flex-wrap gap-4 text-muted-foreground text-sm">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <span>{event.date}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <span>{event.time}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span>{event.location}</span>
              </div>
            </div>
          </div>

          {isUpcoming && (
            <div className="shrink-0">
              <button
                onClick={handleRegister}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-red text-white font-display font-bold text-sm hover:opacity-90 transition-all duration-200 hover:-translate-y-0.5 shadow-[0_0_20px_-5px_hsla(0,72%,51%,0.4)] whitespace-nowrap"
              >
                {language === "fr" ? "S'inscrire" : "Register Now"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-interactive relative overflow-hidden group"
    >
      {/* Left colored strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${isUpcoming ? "bg-gradient-red" : "bg-gradient-green"}`} />

      <div className="pl-6 pr-5 py-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${tagColors[event.tag] ?? "bg-muted text-muted-foreground"}`}>
            {event.tag}
          </span>
          <span className="text-muted-foreground text-xs whitespace-nowrap">{event.date}</span>
        </div>

        <h3 className="font-display font-bold text-base text-foreground mb-2 leading-snug group-hover:text-primary transition-colors">
          {event.title}
        </h3>
        <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-2">
          {event.description}
        </p>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-muted-foreground text-xs mb-4">
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {event.time}
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {event.location}
          </div>
        </div>

        {isUpcoming && (
          <button
            onClick={handleRegister}
            className="w-full py-2.5 rounded-xl bg-gradient-red text-white font-display font-semibold text-sm hover:opacity-90 transition-all duration-200 active:scale-95"
          >
            {language === "fr" ? "S'inscrire" : "Register Now"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function Events() {
  const { language } = useAppStore();
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  const [upcomingEvents, setUpcomingEvents] = useState<EventCardData[]>([]);
  const [pastEvents, setPastEvents] = useState<EventCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Live data load — campus events are a global catalog (not scoped to a
  // signed-in student). Upcoming/past are independent queries, fetched in
  // parallel; getEvents() already DB-orders each (upcoming ascending, past
  // descending), matching the tab's expected order. Errors degrade to empty
  // lists, never a crash — see getPreviousExams() in Sessions.tsx.
  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [upcomingRes, pastRes] = await Promise.all([
          getEvents("upcoming"),
          getEvents("past"),
        ]);
        if (!isMounted) return;

        if (upcomingRes.error) console.error("[Events] getEvents(upcoming) failed", upcomingRes.error);
        if (pastRes.error) console.error("[Events] getEvents(past) failed", pastRes.error);

        setUpcomingEvents(
          (upcomingRes.data ?? []).map((event) => ({
            id: event.id,
            title: event.title,
            date: event.date,
            time: event.time,
            location: event.location,
            tag: event.tag,
            description: event.description,
            type: event.type,
          })),
        );
        setPastEvents(
          (pastRes.data ?? []).map((event) => ({
            id: event.id,
            title: event.title,
            date: event.date,
            time: event.time,
            location: event.location,
            tag: event.tag,
            description: event.description,
            type: event.type,
          })),
        );
      } catch (err) {
        if (!isMounted) return;
        console.error("[Events] events load failed", err);
        setUpcomingEvents([]);
        setPastEvents([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const displayedEvents = activeTab === "upcoming" ? upcomingEvents : pastEvents;
  const featuredEvent = activeTab === "upcoming" ? upcomingEvents[0] : undefined;
  const gridEvents = activeTab === "upcoming" ? upcomingEvents.slice(1) : pastEvents;

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-mesh pointer-events-none" />

      <div className="relative px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
        {/* Breadcrumb */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-muted-foreground mb-6"
        >
          <Link to="/" className="hover:text-foreground transition-colors">
            {language === "fr" ? "Accueil" : "Home"}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground font-medium">
            {language === "fr" ? "Événements" : "Events"}
          </span>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <span className="eyebrow">
            <Calendar className="w-3.5 h-3.5" />
            {language === "fr" ? "Vie de campus" : "Campus life"}
          </span>
          <h1 className="mt-2 font-display font-extrabold text-3xl lg:text-4xl text-gradient-chrome">
            {language === "fr" ? "Événements" : "Events"}
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm">
            {language === "fr"
              ? `${displayedEvents.length} événements`
              : `${displayedEvents.length} events`}
          </p>
        </motion.div>

        {/* Tab Switcher */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2 mb-8 bg-muted rounded-xl p-1 w-fit"
        >
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`px-5 py-2 rounded-lg font-display font-semibold text-sm transition-all duration-200 ${
              activeTab === "upcoming"
                ? "bg-gradient-red text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {language === "fr" ? "A venir" : "Upcoming"}
            {upcomingEvents.length > 0 && (
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === "upcoming" ? "bg-white/20" : "bg-muted-foreground/20"
              }`}>
                {upcomingEvents.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("past")}
            className={`px-5 py-2 rounded-lg font-display font-semibold text-sm transition-all duration-200 ${
              activeTab === "past"
                ? "bg-gradient-green text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {language === "fr" ? "Passés" : "Past"}
            {pastEvents.length > 0 && (
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === "past" ? "bg-white/20" : "bg-muted-foreground/20"
              }`}>
                {pastEvents.length}
              </span>
            )}
          </button>
        </motion.div>

        {isLoading ? (
          <div className="space-y-8" aria-hidden="true">
            {/* Featured skeleton — mirrors surface-raised shell exactly */}
            <div className="surface-raised relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-muted" />
              <div className="pl-8 pr-6 py-6 flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1">
                  <div className="flex gap-2 mb-3">
                    <div className="skeleton h-5 w-20 rounded-full" />
                    <div className="skeleton h-5 w-16 rounded-full" />
                  </div>
                  <div className="skeleton h-6 w-2/3 rounded mb-3" />
                  <div className="skeleton h-4 w-full rounded mb-4" />
                  <div className="flex flex-wrap gap-4">
                    <div className="skeleton h-4 w-24 rounded" />
                    <div className="skeleton h-4 w-24 rounded" />
                    <div className="skeleton h-4 w-24 rounded" />
                  </div>
                </div>
                <div className="shrink-0 skeleton h-11 w-36 rounded-2xl" />
              </div>
            </div>
            {/* Grid skeleton — mirrors surface-interactive shell exactly */}
            <div className="grid sm:grid-cols-2 gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="surface-interactive relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-muted" />
                  <div className="pl-6 pr-5 py-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="skeleton h-5 w-16 rounded-full" />
                      <div className="skeleton h-3 w-16 rounded" />
                    </div>
                    <div className="skeleton h-4 w-3/4 rounded mb-2" />
                    <div className="skeleton h-3.5 w-full rounded mb-4" />
                    <div className="skeleton h-9 w-full rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : displayedEvents.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="surface flex flex-col items-center text-center px-6 py-16"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-display font-extrabold text-xl text-foreground">
              {activeTab === "upcoming"
                ? language === "fr" ? "Aucun événement à venir" : "No upcoming events"
                : language === "fr" ? "Aucun événement passé" : "No past events"}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
              {activeTab === "upcoming"
                ? language === "fr"
                  ? "Revenez bientôt pour découvrir les prochains événements du campus."
                  : "Check back soon for upcoming campus events."
                : language === "fr"
                  ? "Les événements passés apparaîtront ici une fois archivés."
                  : "Past events will appear here once they're archived."}
            </p>
          </motion.div>
        ) : (
          <>
            {/* Featured Event */}
            {featuredEvent && activeTab === "upcoming" && (
              <div className="mb-8">
                <EventCard event={featuredEvent} featured language={language} />
              </div>
            )}

            {/* Grid */}
            {gridEvents.length > 0 && (
              <div>
                {activeTab === "upcoming" && (
                  <p className="font-display font-semibold text-sm text-muted-foreground mb-4">
                    {language === "fr" ? "Autres événements" : "More Events"}
                  </p>
                )}
                <div className="grid sm:grid-cols-2 gap-5">
                  {gridEvents.map((event, i) => (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
                    >
                      <EventCard event={event} language={language} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Past events featured (first past event) */}
            {activeTab === "past" && pastEvents.length > 0 && (
              <div className="mb-8">
                <EventCard event={pastEvents[0]} featured language={language} />
                {pastEvents.length > 1 && (
                  <div className="grid sm:grid-cols-2 gap-5 mt-5">
                    {pastEvents.slice(1).map((event, i) => (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
                      >
                        <EventCard event={event} language={language} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

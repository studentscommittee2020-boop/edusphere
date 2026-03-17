import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Calendar, Clock, MapPin, Users, ChevronRight, ArrowRight, Tag } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/store/appStore";
import type { EventItem } from "@/store/appStore";

const tagColors: Record<string, string> = {
  Science: "bg-blue-500/15 text-blue-300",
  Workshop: "bg-purple-500/15 text-purple-300",
  Cultural: "bg-amber-500/15 text-amber-300",
  Tech: "bg-cyan-500/15 text-cyan-300",
  Academic: "bg-primary/15 text-primary",
  Networking: "bg-secondary/15 text-secondary",
  Lecture: "bg-violet-500/15 text-violet-300",
  Sports: "bg-orange-500/15 text-orange-300",
  Art: "bg-pink-500/15 text-pink-300",
};

function EventCard({ event, featured = false, language }: { event: EventItem; featured?: boolean; language: string }) {
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
        className="relative rounded-2xl border border-border bg-card overflow-hidden"
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
      className="relative rounded-2xl border border-border bg-card card-glow overflow-hidden hover:-translate-y-0.5 transition-all duration-300 group"
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
  const { events, language } = useAppStore();
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  const upcomingEvents = events.filter((e) => e.type === "upcoming");
  const pastEvents = events.filter((e) => e.type === "past");
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
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-red flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-display font-extrabold text-3xl text-foreground">
              {language === "fr" ? "Événements" : "Events"}
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
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
      </div>
    </div>
  );
}

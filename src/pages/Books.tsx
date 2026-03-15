import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ShoppingCart, Star, Package, ChevronRight, Check, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/store/appStore";
import FilterChips, { ActiveFilter } from "@/components/FilterChips";

const MAJORS = ["All", "Common", "Audit & Accounting", "Finance", "Marketing", "Management", "MIS"];
const TRACKS = ["All", "both", "french", "english"];

const majorGradients: Record<string, string> = {
  Common: "linear-gradient(135deg, #4b5563, #6b7280)",
  "Audit & Accounting": "linear-gradient(135deg, #2563eb, #3b82f6)",
  Finance: "linear-gradient(135deg, #7c3aed, #8b5cf6)",
  Marketing: "linear-gradient(135deg, #d97706, #f59e0b)",
  Management: "linear-gradient(135deg, #0d9488, #14b8a6)",
  MIS: "linear-gradient(135deg, #4f46e5, #6366f1)",
};

const majorBadgeColors: Record<string, string> = {
  Common: "bg-gray-500/15 text-gray-300 border-gray-500/30",
  "Audit & Accounting": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  Finance: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  Marketing: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Management: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  MIS: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
};

export default function Books() {
  const { books, cart, addToCart, removeFromCart, language } = useAppStore();

  const [major, setMajor] = useState("All");
  const [track, setTrack] = useState("All");
  const [stockOnly, setStockOnly] = useState(false);

  const filtered = useMemo(() => {
    return books.filter((b) => {
      const majorMatch = major === "All" || b.major === major;
      const trackMatch = track === "All" || b.track === track || b.track === "both";
      const stockMatch = !stockOnly || b.inStock;
      return majorMatch && trackMatch && stockMatch;
    });
  }, [books, major, track, stockOnly]);

  const activeFilters: ActiveFilter[] = [
    ...(major !== "All" ? [{ key: "major", label: language === "fr" ? "Filière" : "Major", value: major }] : []),
    ...(track !== "All" ? [{ key: "track", label: language === "fr" ? "Filière ling." : "Track", value: track }] : []),
    ...(stockOnly ? [{ key: "stock", label: language === "fr" ? "Disponibilité" : "Availability", value: language === "fr" ? "En stock" : "In stock" }] : []),
  ];

  const handleRemoveFilter = (key: string) => {
    if (key === "major") setMajor("All");
    if (key === "track") setTrack("All");
    if (key === "stock") setStockOnly(false);
  };

  const clearAll = () => {
    setMajor("All");
    setTrack("All");
    setStockOnly(false);
  };

  const handleCartToggle = (bookId: number, title: string) => {
    if (cart.includes(bookId)) {
      removeFromCart(bookId);
      toast(language === "fr" ? `"${title}" retiré du panier` : `"${title}" removed from cart`);
    } else {
      addToCart(bookId);
      toast.success(language === "fr" ? `"${title}" ajouté au panier` : `"${title}" added to cart`);
    }
  };

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-mesh pointer-events-none" />

      <div className="relative px-6 py-8 max-w-7xl mx-auto">
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
            {language === "fr" ? "Commander des Livres" : "Order Books"}
          </span>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-start justify-between gap-4 mb-8"
        >
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-green flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-white" />
              </div>
              <h1 className="font-display font-extrabold text-3xl text-foreground">
                {language === "fr" ? "Commander des Livres" : "Order Books"}
              </h1>
            </div>
            <p className="text-muted-foreground text-sm">
              {language === "fr" ? `${filtered.length} livres disponibles` : `${filtered.length} books available`}
            </p>
          </div>

          {cart.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/10 border border-secondary/30">
              <ShoppingCart className="w-4 h-4 text-secondary" />
              <span className="font-display font-semibold text-secondary text-sm">
                {cart.length} {language === "fr" ? "article(s) dans le panier" : "item(s) in cart"}
              </span>
            </div>
          )}
        </motion.div>

        {/* Filters row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap items-center gap-3 mb-5"
        >
          {/* Major pills */}
          <div className="flex flex-wrap gap-2">
            {MAJORS.map((m) => (
              <button
                key={m}
                onClick={() => setMajor(m)}
                className={`px-3.5 py-1.5 rounded-xl font-display font-semibold text-sm transition-all duration-200 border ${
                  major === m
                    ? "bg-gradient-red text-white border-transparent shadow-[0_0_16px_-5px_hsla(0,72%,51%,0.4)]"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-border hidden sm:block" />

          {/* Track filter */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              {language === "fr" ? "Filière:" : "Track:"}
            </span>
            {TRACKS.map((t) => (
              <button
                key={t}
                onClick={() => setTrack(t)}
                className={`px-3 py-1 rounded-lg text-xs font-display font-semibold transition-all duration-200 ${
                  track === t
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "All" ? "All" : t === "both" ? "Both" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Active Filter Chips */}
        {activeFilters.length > 0 && (
          <div className="mb-6">
            <FilterChips filters={activeFilters} onRemove={handleRemoveFilter} onClearAll={clearAll} />
          </div>
        )}

        {/* Books Grid */}
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-display font-bold text-lg text-foreground mb-2">
              {language === "fr" ? "Aucun livre trouvé" : "No books found"}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {language === "fr" ? "Essayez d'autres filtres" : "Try different filters"}
            </p>
            <button
              onClick={clearAll}
              className="px-4 py-2 rounded-xl bg-secondary/10 text-secondary text-sm font-medium hover:bg-secondary/20 transition-colors"
            >
              {language === "fr" ? "Réinitialiser" : "Reset filters"}
            </button>
          </motion.div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((book, i) => {
              const inCart = cart.includes(book.id);
              return (
                <motion.div
                  key={book.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  className="group rounded-2xl border border-border bg-card card-glow-green overflow-hidden hover:-translate-y-0.5 transition-all duration-300"
                >
                  {/* Book Cover */}
                  <div
                    className="h-36 flex items-center justify-center relative overflow-hidden"
                    style={{ background: majorGradients[book.major] ?? majorGradients["Common"] }}
                  >
                    {/* Major letter */}
                    <span className="font-display font-extrabold text-7xl text-white/20 select-none">
                      {book.major.charAt(0)}
                    </span>

                    {/* Major badge */}
                    <div className="absolute bottom-3 left-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${majorBadgeColors[book.major] ?? "bg-muted text-muted-foreground border-border"} bg-black/30 backdrop-blur-sm`}>
                        {book.major}
                      </span>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-5">
                    <h3 className="font-display font-bold text-base text-foreground leading-tight mb-1 group-hover:text-secondary transition-colors">
                      {language === "fr" ? book.titleFr : book.title}
                    </h3>
                    <p className="text-muted-foreground text-xs mb-1">{book.author}</p>
                    <p className="text-muted-foreground text-xs mb-4">
                      {language === "fr" ? "Semestres:" : "Semesters:"} {book.semesters}
                    </p>

                    {/* Add to cart button */}
                    <button
                      onClick={() => handleCartToggle(book.id, language === "fr" ? book.titleFr : book.title)}
                      disabled={!book.inStock}
                      className={`w-full py-2.5 rounded-xl font-display font-bold text-sm transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 ${
                        !book.inStock
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : inCart
                          ? "bg-secondary/15 text-secondary border border-secondary/30 hover:bg-secondary/25"
                          : "bg-gradient-green text-white hover:opacity-90"
                      }`}
                      aria-label={`${inCart ? "Remove" : "Add"} ${book.title} ${inCart ? "from" : "to"} cart`}
                    >
                      {!book.inStock ? (
                        <>
                          <Package className="w-4 h-4" />
                          {language === "fr" ? "Epuisé" : "Out of Stock"}
                        </>
                      ) : inCart ? (
                        <>
                          <Check className="w-4 h-4" />
                          {language === "fr" ? "Dans le panier" : "In Cart"}
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-4 h-4" />
                          {language === "fr" ? "Ajouter au panier" : "Add to Cart"}
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

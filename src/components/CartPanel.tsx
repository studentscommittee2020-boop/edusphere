import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingCart, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/store/appStore";

interface CartPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function CartPanel({ open, onClose }: CartPanelProps) {
  const { books, cart, removeFromCart, clearCart, language } = useAppStore();

  const cartBooks = books.filter((b) => cart.includes(b.id));
  const total = cartBooks.reduce((sum, b) => sum + b.price, 0);

  const handlePlaceOrder = () => {
    clearCart();
    onClose();
    toast.success(
      language === "fr"
        ? "Commande passée avec succès ! Vous serez contacté sous peu."
        : "Order placed successfully! You will be contacted shortly."
    );
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-sm bg-card border-l border-border z-50 flex flex-col shadow-2xl"
            role="dialog"
            aria-label={language === "fr" ? "Panier" : "Shopping Cart"}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <ShoppingCart className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-lg">
                  {language === "fr" ? "Panier" : "Cart"}
                </h2>
                {cart.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-bold">
                    {cart.length}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                aria-label="Close cart"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {cartBooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                    <Package className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-display font-semibold text-foreground mb-1">
                      {language === "fr" ? "Panier vide" : "Cart is empty"}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {language === "fr"
                        ? "Ajoutez des livres pour les commander."
                        : "Add books to place an order."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {cartBooks.map((book) => (
                    <motion.div
                      key={book.id}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border"
                    >
                      {/* Book cover mini */}
                      <div
                        className="w-10 h-12 rounded-lg flex items-center justify-center shrink-0 text-white font-display font-bold text-sm"
                        style={{ background: getMajorGradient(book.major) }}
                      >
                        {book.major.charAt(0)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-display font-semibold text-sm text-foreground leading-tight truncate">
                          {language === "fr" ? book.titleFr : book.title}
                        </p>
                        <p className="text-muted-foreground text-xs mt-0.5 truncate">{book.author}</p>
                        <p className="text-primary font-bold text-sm mt-1">{book.price} DZD</p>
                      </div>

                      <button
                        onClick={() => removeFromCart(book.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                        aria-label={`Remove ${book.title} from cart`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {cartBooks.length > 0 && (
              <div className="px-5 py-4 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm font-medium">
                    {language === "fr" ? "Total" : "Total"}
                  </span>
                  <span className="font-display font-bold text-xl text-foreground">
                    {total} <span className="text-sm font-medium text-muted-foreground">DZD</span>
                  </span>
                </div>

                <button
                  onClick={handlePlaceOrder}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-green text-white font-display font-bold text-sm transition-all duration-200 hover:opacity-90 active:scale-95"
                >
                  {language === "fr" ? "Passer la Commande" : "Place Order"}
                </button>

                <button
                  onClick={() => clearCart()}
                  className="w-full py-2 px-4 rounded-xl border border-border text-muted-foreground text-sm font-medium transition-all duration-200 hover:text-foreground hover:border-foreground/30"
                >
                  {language === "fr" ? "Vider le Panier" : "Clear Cart"}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function getMajorGradient(major: string): string {
  const map: Record<string, string> = {
    Common: "linear-gradient(135deg, #6b7280, #9ca3af)",
    Audit: "linear-gradient(135deg, #3b82f6, #60a5fa)",
    Finance: "linear-gradient(135deg, #8b5cf6, #a78bfa)",
    Marketing: "linear-gradient(135deg, #f59e0b, #fbbf24)",
    Management: "linear-gradient(135deg, #14b8a6, #2dd4bf)",
    MIS: "linear-gradient(135deg, #6366f1, #818cf8)",
  };
  return map[major] ?? map["Common"];
}

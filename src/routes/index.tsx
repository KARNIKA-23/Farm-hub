import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Leaf,
  LogOut,
  Menu,
  Moon,
  PackageCheck,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sun,
  Truck,
  X,
} from "lucide-react";
import {
  categories,
  currency,
  marketProducts,
  orderStages,
  stageIndex,
  type MarketProduct,
} from "@/lib/farmconnect";
import { toast } from "sonner";

type Workspace = "buyer" | "farmer";
type View = "market" | "orders" | "inventory" | "profile";
type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };
type CartLine = { product: MarketProduct; quantity: number };
type Order = {
  id: string;
  buyer_id: string;
  farmer_id: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  status: string;
  order_date: string;
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FarmConnect Hub — Fresh from local growers" },
      { name: "description", content: "Shop seasonal produce directly from local farms, or manage orders and harvest inventory in your farmer workspace." },
      { property: "og:title", content: "FarmConnect Hub — Fresh from local growers" },
      { property: "og:description", content: "A direct marketplace for local farmers and buyers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FarmConnect,
});

const statusLabels: Record<string, string> = {
  pending: "Order placed",
  accepted: "Accepted",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const imageFor = (product: MarketProduct) => {
  if (product.image_url.startsWith("http")) return product.image_url;
  const demo = marketProducts.find((item) => item.id === product.id || item.name === product.name);
  return demo?.image_url ?? marketProducts[0]?.image_url ?? "";
};

function FarmConnect() {
  const [workspace, setWorkspace] = useState<Workspace>("buyer");
  const [view, setView] = useState<View>("market");
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authRole, setAuthRole] = useState<Workspace>("buyer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [farmName, setFarmName] = useState("");
  const [location, setLocation] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<Workspace[]>([]);
  const [profile, setProfile] = useState({ display_name: "", farm_name: "", location: "", avatar_url: "" });
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [products, setProducts] = useState<MarketProduct[]>(marketProducts);
  const [orders, setOrders] = useState<Order[]>([]);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MarketProduct | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productQuantity, setProductQuantity] = useState("");
  const [productCategory, setProductCategory] = useState("Vegetables");
  const [productDescription, setProductDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("farmconnect-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED" && event !== "INITIAL_SESSION") return;
      setUser(session?.user ? { id: session.user.id, email: session.user.email, user_metadata: session.user.user_metadata } : null);
    });
    void supabase.auth.getUser().then(({ data: result }) => {
      setUser(result.user ? { id: result.user.id, email: result.user.email, user_metadata: result.user.user_metadata } : null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("farmconnect-theme", theme);
  }, [theme]);

  const loadAccount = useCallback(async (account: AuthUser) => {
    const [{ data: profileRow }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("display_name, farm_name, location, avatar_url").eq("id", account.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", account.id),
    ]);
    const metadata = account.user_metadata ?? {};
    const name = String(profileRow?.display_name || metadata.display_name || account.email?.split("@")[0] || "Grower");
    const roleList = (roleRows ?? []).map((row) => row.role).filter((role): role is Workspace => role === "buyer" || role === "farmer");
    const selectedRole = String(metadata.marketplace_role ?? authRole) === "farmer" ? "farmer" : "buyer";
    const nextProfile = {
      display_name: name,
      farm_name: String(profileRow?.farm_name || metadata.farm_name || ""),
      location: String(profileRow?.location || metadata.location || ""),
      avatar_url: String(profileRow?.avatar_url || ""),
    };
    if (!profileRow) {
      await supabase.from("profiles").insert({ id: account.id, ...nextProfile });
    }
    if (!roleList.length) {
      const { error } = await supabase.from("user_roles").insert({ user_id: account.id, role: selectedRole });
      if (!error) roleList.push(selectedRole);
    }
    setProfile(nextProfile);
    setRoles(roleList);
    if (roleList.length && !roleList.includes(workspace)) setWorkspace(roleList[0] ?? "buyer");
  }, [authRole, workspace]);

  useEffect(() => {
    if (user) void loadAccount(user);
    else {
      setRoles([]);
      setOrders([]);
      setProfile({ display_name: "", farm_name: "", location: "", avatar_url: "" });
    }
  }, [user, loadAccount]);

  const loadMarket = useCallback(async () => {
    const { data, error } = await supabase.from("products").select("*").eq("is_active", true).order("created_at", { ascending: false });
    if (error || !data?.length) return marketProducts;
    return data as MarketProduct[];
  }, []);

  const { data: marketRows = marketProducts, refetch: refetchMarket } = useQuery({
    queryKey: ["farmconnect", "products"],
    queryFn: loadMarket,
    staleTime: 60_000,
  });

  useEffect(() => {
    setProducts(marketRows);
  }, [marketRows]);

  const refreshAccountData = useCallback(async () => {
    if (!user) return;
    const { data: orderRows } = await supabase.from("orders").select("*").order("order_date", { ascending: false });
    const ownOrders = (orderRows ?? []) as Order[];
    setOrders(ownOrders.filter((order) => workspace === "buyer" ? order.buyer_id === user.id : order.farmer_id === user.id));
    if (workspace === "buyer") {
      const { data: cartRows } = await supabase.from("cart_items").select("id, product_id, quantity").eq("buyer_id", user.id);
      const rows = cartRows ?? [];
      if (rows.length) {
        const ids = rows.map((row) => row.product_id);
        const { data: cartProducts } = await supabase.from("products").select("*").in("id", ids);
        setCart(rows.flatMap((row) => {
          const product = (cartProducts ?? []).find((entry) => entry.id === row.product_id) as MarketProduct | undefined;
          return product ? [{ product, quantity: row.quantity }] : [];
        }));
      } else setCart([]);
    }
  }, [user, workspace]);

  useEffect(() => {
    void refreshAccountData();
  }, [refreshAccountData]);

  const filteredProducts = useMemo(() => products.filter((product) => {
    const term = search.trim().toLowerCase();
    const matchesText = !term || `${product.name} ${product.seller_name} ${product.description}`.toLowerCase().includes(term);
    return matchesText && (category === "All" || product.category === category);
  }), [products, search, category]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const deliveredOrders = orders.filter((order) => order.status === "delivered");
  const farmerProducts = products.filter((product) => product.farmer_id === user?.id);
  const farmerOrders = orders.filter((order) => order.farmer_id === user?.id && order.status !== "cancelled");
  const totalRevenue = deliveredOrders.reduce((sum, order) => sum + order.total_price, 0);
  const salesBars = [26, 44, 34, 58, 42, 70, 48, 62, 55, 83, 68, 100];

  const openAuth = (role: Workspace = workspace) => {
    setAuthRole(role);
    setAuthMessage("");
    setAuthOpen(true);
  };

  const addWorkspaceRole = async (nextRole: Workspace) => {
    if (!user) return;
    if (roles.includes(nextRole)) {
      setWorkspace(nextRole);
      setView(nextRole === "farmer" ? "orders" : "market");
      return;
    }
    const { error } = await supabase.from("user_roles").insert({ user_id: user.id, role: nextRole });
    if (error) {
      toast.error("That workspace couldn’t be added yet.");
      return;
    }
    setRoles((previous) => [...previous, nextRole]);
    setWorkspace(nextRole);
    setView(nextRole === "farmer" ? "orders" : "market");
  };

  const handleWorkspaceChange = (nextRole: Workspace) => {
    setView(nextRole === "farmer" ? "orders" : "market");
    if (!user) {
      setWorkspace(nextRole);
      return;
    }
    void addWorkspaceRole(nextRole);
  };

  const handleAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    const response = authMode === "signup"
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName, farm_name: farmName, location, marketplace_role: authRole },
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (response.error) {
      setAuthMessage(response.error.message);
      return;
    }
    if (authMode === "signup" && !response.data.session) {
      setAuthMessage("Your account is ready. Check your email to confirm, then come back to sign in.");
      return;
    }
    setAuthOpen(false);
    toast.success(authMode === "signup" ? "Welcome to FarmConnect." : "Welcome back.");
    if (response.data.user) {
      const account = { id: response.data.user.id, email: response.data.user.email, user_metadata: response.data.user.user_metadata };
      setUser(account);
      await loadAccount(account);
    }
  };

  const handleGoogle = async () => {
    setAuthBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    setAuthBusy(false);
    if (result.error) setAuthMessage(result.error.message);
    else if (!result.redirected) setAuthOpen(false);
  };

  const addToCart = async (product: MarketProduct) => {
    if (!product.quantity) return toast.error("This harvest is sold out.");
    const current = cart.find((line) => line.product.id === product.id);
    const nextQty = (current?.quantity ?? 0) + 1;
    if (nextQty > product.quantity) return toast.error("That’s the available harvest quantity.");
    setCart((previous) => current
      ? previous.map((line) => line.product.id === product.id ? { ...line, quantity: nextQty } : line)
      : [...previous, { product, quantity: 1 }]);
    if (user && roles.includes("buyer") && !product.id.startsWith("demo-")) {
      const { error } = await supabase.from("cart_items").upsert({ buyer_id: user.id, product_id: product.id, quantity: nextQty }, { onConflict: "buyer_id,product_id" });
      if (error) toast.error("The item was added to this basket only.");
    }
    toast.success(`${product.name} added to your basket`);
  };

  const changeCartQuantity = async (productId: string, delta: number) => {
    const line = cart.find((entry) => entry.product.id === productId);
    if (!line) return;
    const nextQty = Math.max(0, Math.min(line.product.quantity, line.quantity + delta));
    setCart((previous) => nextQty === 0
      ? previous.filter((entry) => entry.product.id !== productId)
      : previous.map((entry) => entry.product.id === productId ? { ...entry, quantity: nextQty } : entry));
    if (user && roles.includes("buyer") && !productId.startsWith("demo-")) {
      if (!nextQty) await supabase.from("cart_items").delete().eq("buyer_id", user.id).eq("product_id", productId);
      else await supabase.from("cart_items").update({ quantity: nextQty }).eq("buyer_id", user.id).eq("product_id", productId);
    }
  };

  const checkout = async () => {
    if (!cart.length) return;
    if (!user) {
      setCartOpen(false);
      openAuth("buyer");
      return;
    }
    if (!roles.includes("buyer")) {
      setCartOpen(false);
      setWorkspace("buyer");
      setView("market");
      return openAuth("buyer");
    }
    const orderRows = cart.filter((line) => !line.product.id.startsWith("demo-")).map(({ product, quantity }) => ({
      buyer_id: user.id,
      farmer_id: product.farmer_id,
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit: product.unit,
      unit_price: product.price,
      total_price: product.price * quantity,
    }));
    if (orderRows.length !== cart.length) {
      toast.error("Sign in as a buyer to check out these sample listings. New account listings are ready for checkout.");
      return;
    }
    const { error } = await supabase.from("orders").insert(orderRows);
    if (error) return toast.error("Checkout couldn’t be completed. Please try again.");
    await supabase.from("cart_items").delete().eq("buyer_id", user.id);
    setCart([]);
    setCartOpen(false);
    await refreshAccountData();
    setView("orders");
    toast.success("Your order is on its way to the grower.");
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return toast.error("Couldn’t sign out. Please try again.");
    setUser(null);
    setWorkspace("buyer");
    setView("market");
    setCart([]);
    toast.success("Signed out.");
  };

  const saveProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return openAuth("farmer");
    setSaving(true);
    const changes = {
      name: productName.trim(),
      description: productDescription.trim(),
      price: Number(productPrice),
      quantity: Number(productQuantity),
      category: productCategory,
      seller_name: profile.farm_name || profile.display_name || "Local grower",
      farmer_id: user.id,
      is_active: true,
    };
    const response = editingProduct
      ? await supabase.from("products").update(changes).eq("id", editingProduct.id).select().single()
      : await supabase.from("products").insert(changes).select().single();
    setSaving(false);
    if (response.error) return toast.error("Couldn’t save this listing. Try again.");
    setProductDialogOpen(false);
    setEditingProduct(null);
    await refetchMarket();
    toast.success(editingProduct ? "Listing updated." : "Your harvest is now listed.");
  };

  const openProductForm = (product?: MarketProduct) => {
    setEditingProduct(product ?? null);
    setProductName(product?.name ?? "");
    setProductPrice(product?.price.toString() ?? "");
    setProductQuantity(product?.quantity.toString() ?? "");
    setProductCategory(product?.category ?? "Vegetables");
    setProductDescription(product?.description ?? "");
    setProductDialogOpen(true);
  };

  const deleteProduct = async (product: MarketProduct) => {
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) return toast.error("Couldn’t remove that listing.");
    await refetchMarket();
    toast.success("Listing removed.");
  };

  const advanceOrder = async (order: Order, status: string) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", order.id);
    if (error) return toast.error("This order couldn’t be updated.");
    await refreshAccountData();
    toast.success(`Order moved to ${statusLabels[status] ?? status}.`);
  };

  const updateProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName, farm_name: farmName, location }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error("Your profile couldn’t be saved.");
    setProfile((old) => ({ ...old, display_name: displayName, farm_name: farmName, location }));
    toast.success("Profile saved.");
  };

  const activeNav = (next: View) => {
    setView(next);
    setMobileNavOpen(false);
  };

  const isDemo = !user || !roles.includes("farmer");

  return (
    <div className="market-wash min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={() => setMobileNavOpen((value) => !value)}><Menu /></Button>
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground ring-1 ring-border/50"><Leaf size={19} /></div>
            <div className="leading-none">
              <p className="font-display text-[15px] font-semibold">FarmConnect Hub</p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">Produce exchange</p>
            </div>
          </div>
          <div className="ml-1 hidden items-center rounded-full bg-muted/80 p-1 ring-1 ring-border/60 sm:flex">
            <Button variant="ghost" className={`h-8 rounded-full px-3.5 text-sm ${workspace === "buyer" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => handleWorkspaceChange("buyer")}>Buyer</Button>
            <Button variant="ghost" className={`h-8 rounded-full px-3.5 text-sm ${workspace === "farmer" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => handleWorkspaceChange("farmer")}>Farmer</Button>
          </div>
          <div className="mx-auto hidden w-full max-w-md md:block">
            <label className="flex h-10 items-center gap-2 rounded-full bg-card/80 px-3.5 ring-1 ring-border/70 focus-within:ring-primary">
              <Search size={16} className="shrink-0 text-muted-foreground" />
              <Input aria-label="Search produce" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search produce, farms…" className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0" />
              <span className="hidden shrink-0 text-xs text-muted-foreground lg:inline">⌘ K</span>
            </label>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button variant="outline" className="relative h-10 rounded-full border-border/70 bg-card/80 px-3 text-foreground/75" onClick={() => setCartOpen(true)} aria-label={`Open basket, ${cartCount} items`}>
              <ShoppingCart size={16} /><span className="hidden sm:inline">Basket</span>
              {cartCount > 0 && <span className="fc-pop absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-gold text-[11px] font-semibold text-foreground">{cartCount}</span>}
            </Button>
            <Button variant="outline" size="icon" className="size-10 rounded-full border-border/70 bg-card/80 text-foreground/75" aria-label={theme === "light" ? "Switch to dark appearance" : "Switch to light appearance"} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </Button>
            <Button variant="ghost" className="size-10 rounded-full p-0" aria-label={user ? "Open profile" : "Sign in"} onClick={() => user ? activeNav("profile") : openAuth()}>
              <Avatar className="size-9 ring-1 ring-border/70"><AvatarImage src={profile.avatar_url || undefined} /><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{user ? (profile.display_name.slice(0, 2).toUpperCase() || "FC") : <CircleUserRound size={18} />}</AvatarFallback></Avatar>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border/50 px-4 py-2 sm:hidden">
          <Button variant="ghost" className={`h-8 flex-1 rounded-full ${workspace === "buyer" ? "bg-card shadow-sm" : "text-muted-foreground"}`} onClick={() => handleWorkspaceChange("buyer")}>Buyer</Button>
          <Button variant="ghost" className={`h-8 flex-1 rounded-full ${workspace === "farmer" ? "bg-card shadow-sm" : "text-muted-foreground"}`} onClick={() => handleWorkspaceChange("farmer")}>Farmer</Button>
          <label className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-card px-2.5 ring-1 ring-border/60"><Search size={15} className="shrink-0 text-muted-foreground" /><Input aria-label="Search produce" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search produce…" className="h-8 min-w-0 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0" /></label>
        </div>
      </header>

      {mobileNavOpen && <div className="fixed inset-0 z-40 bg-foreground/20 md:hidden" onClick={() => setMobileNavOpen(false)}><nav className="w-72 space-y-1 border-r border-border bg-background p-5" onClick={(event) => event.stopPropagation()}><div className="mb-5 flex items-center justify-between"><span className="font-display font-semibold">Workspace</span><Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X /></Button></div><NavButton icon={<ShoppingBag />} label="Market" active={view === "market"} onClick={() => activeNav("market")} /><NavButton icon={<PackageCheck />} label="Orders" active={view === "orders"} onClick={() => activeNav("orders")} /><NavButton icon={<Leaf />} label="Inventory" active={view === "inventory"} onClick={() => activeNav("inventory")} /><NavButton icon={<CircleUserRound />} label="Profile" active={view === "profile"} onClick={() => activeNav("profile")} /></nav></div>}

      <main className="relative mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0 fc-slide">
            {workspace === "buyer" && view === "market" && <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">From nearby growers</p>
                  <h1 className="font-display text-2xl font-semibold sm:text-3xl">Today’s fresh produce</h1>
                  <p className="mt-1 text-sm text-muted-foreground">Sourced from local growers. Pickup and delivery available.</p>
                </div>
                <div className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-1">
                  {categories.map((item) => <Button key={item} variant="ghost" onClick={() => setCategory(item)} className={`h-9 shrink-0 rounded-full px-3.5 text-sm ${category === item ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "bg-card/80 text-muted-foreground ring-1 ring-border/60 hover:text-foreground"}`}>{item}</Button>)}
                </div>
              </div>
              <div className="space-y-3">
                {filteredProducts.map((product) => <article key={product.id} className="group flex min-w-0 items-center gap-3 rounded-2xl bg-card/80 p-3 ring-1 ring-border/60 backdrop-blur-md transition-shadow hover:shadow-md sm:gap-4">
                  <img src={imageFor(product)} alt={product.name} loading="lazy" width={816} height={816} className="size-[76px] shrink-0 rounded-xl object-cover sm:size-20" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="truncate font-display text-[15px] font-medium">{product.name}</h2><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{product.category === "Pantry" ? "Small-batch" : "Local"}</span></div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{product.seller_name}</p>
                    <p className="mt-1 hidden text-sm text-muted-foreground/80 sm:block">{product.quantity <= 8 ? "In season · limited stock" : "Harvested fresh · pickup and delivery"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-base font-semibold">{currency(product.price)}<span className="font-sans text-sm font-normal text-muted-foreground">/{product.unit}</span></p>
                    <Button onClick={() => void addToCart(product)} disabled={!product.quantity} className="mt-1.5 h-9 rounded-full px-3 text-sm"><Plus size={15} /> Add</Button>
                  </div>
                </article>)}
                {!filteredProducts.length && <div className="rounded-2xl border border-dashed border-border px-5 py-14 text-center"><p className="font-display text-lg font-semibold">No harvests found</p><p className="mt-1 text-sm text-muted-foreground">Try another search or category.</p><Button variant="outline" className="mt-4 rounded-full" onClick={() => { setSearch(""); setCategory("All"); }}>Clear filters</Button></div>}
              </div>
            </>}

            {workspace === "farmer" && <>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">Grower workspace</p><h1 className="font-display text-2xl font-semibold sm:text-3xl">{profile.farm_name || "Farm overview"}</h1><p className="mt-1 text-sm text-muted-foreground">{profile.location || "Your harvest, orders and sales in one place."}</p></div>
                <Button onClick={() => openProductForm()} className="h-10 rounded-full px-4"><Plus size={16} /> Add produce</Button>
              </div>
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric label="Delivered sales" value={isDemo ? "$1,240" : currency(totalRevenue)} note={isDemo ? "+18% vs last week" : "Updates when orders arrive"} />
                <Metric label="Open orders" value={isDemo ? "14" : String(farmerOrders.filter((order) => order.status !== "delivered").length)} note="Need fulfillment" />
                <Metric label="Live listings" value={isDemo ? "8" : String(farmerProducts.length)} note={farmerProducts.filter((product) => product.quantity < 10).length + (isDemo ? 1 : 0) + " low on stock"} />
              </div>
              <div className="mb-5 rounded-2xl bg-card/80 p-5 ring-1 ring-border/60">
                <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display font-semibold">Monthly sales</h2><p className="text-sm text-muted-foreground">Delivered orders · this year</p></div><BarChart3 size={18} className="text-primary" /></div>
                <div className="flex h-32 items-end gap-2 border-b border-border/60 px-1">{salesBars.map((height, index) => <div key={index} className={`flex-1 rounded-t-md transition-all ${index === 11 ? "bg-primary" : "bg-primary/15"}`} style={{ height: `${height}%` }} title={`Month ${index + 1}`} />)}</div>
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Nov</span><span>Dec</span></div>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border/70 pb-3">
                <Button variant="ghost" className={`h-9 rounded-full px-4 ${view === "orders" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`} onClick={() => setView("orders")}>Orders</Button>
                <Button variant="ghost" className={`h-9 rounded-full px-4 ${view === "inventory" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`} onClick={() => setView("inventory")}>Inventory</Button>
                <Button variant="ghost" className={`h-9 rounded-full px-4 ${view === "profile" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`} onClick={() => setView("profile")}>Farm profile</Button>
              </div>
              {view === "orders" && <OrderList orders={farmerOrders} mode="farmer" onAdvance={advanceOrder} onSignIn={() => openAuth("farmer")} demo={isDemo} />}
              {view === "inventory" && <Inventory products={isDemo ? marketProducts : farmerProducts} onEdit={openProductForm} onDelete={deleteProduct} onAdd={() => openProductForm()} demo={isDemo} onSignIn={() => openAuth("farmer")} />}
              {view === "profile" && <ProfileForm profile={profile} displayName={displayName} farmName={farmName} location={location} setDisplayName={setDisplayName} setFarmName={setFarmName} setLocation={setLocation} onSubmit={updateProfile} saving={saving} signedIn={Boolean(user)} onSignIn={() => openAuth("farmer")} />}
            </>}

            {workspace === "buyer" && view === "orders" && <>
              <div className="mb-5"><p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">Your purchases</p><h1 className="font-display text-2xl font-semibold sm:text-3xl">Order history</h1></div>
              <OrderList orders={orders} mode="buyer" onAdvance={advanceOrder} onSignIn={() => openAuth("buyer")} demo={false} />
            </>}

            {workspace === "buyer" && view === "profile" && <ProfileForm profile={profile} displayName={displayName} farmName={farmName} location={location} setDisplayName={setDisplayName} setFarmName={setFarmName} setLocation={setLocation} onSubmit={updateProfile} saving={saving} signedIn={Boolean(user)} onSignIn={() => openAuth("buyer")} />}
          </section>

          <aside className="space-y-4 fc-slide">
            {workspace === "buyer" ? <>
              <section className="rounded-2xl bg-card/75 p-5 ring-1 ring-border/60 backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between"><h2 className="font-display font-semibold">Your basket</h2><span className="text-xs font-medium text-muted-foreground">{cartCount} {cartCount === 1 ? "item" : "items"}</span></div>
                {cart.length ? <>
                  <ul className="space-y-3">{cart.map(({ product, quantity }) => <li key={product.id} className="flex items-center gap-3 text-sm"><img src={imageFor(product)} alt="" loading="lazy" width={816} height={816} className="size-11 rounded-lg object-cover" /><span className="min-w-0 flex-1 truncate">{product.name} <span className="text-muted-foreground">×{quantity}</span></span><span className="shrink-0 font-medium">{currency(product.price * quantity)}</span></li>)}</ul>
                  <div className="mt-4 border-t border-border/70 pt-4"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-display text-lg font-semibold">{currency(subtotal)}</span></div></div>
                  <Button className="mt-4 w-full rounded-full" onClick={() => void checkout()}>Continue to checkout <ChevronRight size={16} /></Button>
                </> : <div className="rounded-xl bg-muted/70 px-4 py-5 text-center"><ShoppingBag size={21} className="mx-auto text-muted-foreground" /><p className="mt-2 text-sm font-medium">Your basket is waiting</p><p className="mt-1 text-xs text-muted-foreground">Add a fresh harvest to get started.</p></div>}
              </section>
              <DeliveryCard order={orders.find((order) => order.status !== "delivered" && order.status !== "cancelled")} />
              <section className="rounded-2xl bg-card/75 p-5 ring-1 ring-border/60 backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between"><h2 className="font-display font-semibold">Farmer workspace</h2><span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold">{user ? (roles.includes("farmer") ? "Ready" : "Get started") : "Preview"}</span></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-muted/70 p-3"><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Sales today</p><p className="mt-1 font-display text-xl font-semibold">{user && roles.includes("farmer") ? currency(totalRevenue) : "$1,240"}</p><p className="mt-0.5 text-[11px] font-medium text-primary">Delivered orders</p></div>
                  <div className="rounded-xl bg-muted/70 p-3"><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Open orders</p><p className="mt-1 font-display text-xl font-semibold">{user && roles.includes("farmer") ? farmerOrders.filter((order) => order.status !== "delivered").length : "14"}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Ready to fulfill</p></div>
                </div>
                <div className="mt-4 space-y-3"><h3 className="font-display text-sm font-semibold">Order fulfillment</h3>{(farmerOrders.length ? farmerOrders.slice(0, 2) : isDemo ? ["#4821", "#4820"] : []).map((order, index) => {
                  const isReal = typeof order !== "string";
                  const status = isReal ? order.status : index === 0 ? "shipped" : "packed";
                  const percentage = (stageIndex(status) + 1) * 20;
                  return <div key={isReal ? order.id : order} className="text-sm"><div className="flex items-center justify-between"><span className="font-medium">{isReal ? `Order #${order.id.slice(0, 4)}` : `Order ${order}`}</span><span className="text-xs text-muted-foreground">{statusLabels[status] ?? "Packing"}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percentage}%` }} /></div><p className="mt-1.5 text-[11px] text-muted-foreground">{isReal ? `${order.quantity} items · ${currency(order.total_price)}` : "Local delivery · tracking available"}</p></div>;
                })}{!farmerOrders.length && !isDemo && <p className="text-sm text-muted-foreground">New orders will appear here.</p>}</div>
                <Button variant="outline" className="mt-4 w-full rounded-full" onClick={() => handleWorkspaceChange("farmer")}>{user && roles.includes("farmer") ? "Open farmer dashboard" : "Open farmer workspace"}<ChevronRight size={15} /></Button>
              </section>
            </> : <>
              <section className="rounded-2xl bg-card/75 p-5 ring-1 ring-border/60 backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display font-semibold">Order fulfillment</h2><p className="text-sm text-muted-foreground">Your latest order progress</p></div><Truck size={18} className="text-primary" /></div>
                {farmerOrders.slice(0, 2).map((order) => <div key={order.id} className="mb-4 last:mb-0"><div className="flex items-center justify-between text-sm"><span className="font-medium">{order.product_name}</span><span className="text-muted-foreground">{statusLabels[order.status]}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(stageIndex(order.status) + 1) * 20}%` }} /></div><p className="mt-1.5 text-[11px] text-muted-foreground">{currency(order.total_price)} · {order.quantity} {order.unit}</p></div>)}
                {!farmerOrders.length && <div className="rounded-xl bg-muted/70 p-4 text-sm text-muted-foreground">{isDemo ? "New orders appear here when buyers check out." : "You’re all caught up. New orders appear here."}</div>}
              </section>
              <section className="rounded-2xl bg-card/75 p-5 ring-1 ring-border/60 backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between"><h2 className="font-display font-semibold">Inventory</h2><Button variant="ghost" size="icon" className="size-8" aria-label="View inventory" onClick={() => setView("inventory")}><ChevronRight size={16} /></Button></div>
                <div className="space-y-3 text-sm">{(isDemo ? marketProducts : farmerProducts).slice(0, 4).map((product) => { const low = product.quantity < 10; return <div key={product.id} className="flex items-center justify-between gap-3"><span className="truncate text-foreground/75">{product.name}</span><span className={`shrink-0 font-medium ${low ? "text-gold" : "text-primary"}`}>{low ? `Low · ${product.quantity}` : `${product.quantity} ${product.unit}`}</span></div>; })}{!isDemo && !farmerProducts.length && <p className="text-sm text-muted-foreground">Your listings will appear here.</p>}</div>
              </section>
              <section className="rounded-2xl bg-primary/5 p-5 ring-1 ring-primary/10"><div className="flex items-center gap-2 text-sm font-semibold text-primary"><PackageCheck size={16} /> Delivered-order revenue</div><p className="mt-2 font-display text-2xl font-semibold">{isDemo ? "$1,240" : currency(totalRevenue)}</p><p className="mt-1 text-xs text-muted-foreground">Revenue totals update when orders are marked delivered.</p></section>
            </>}
          </aside>
        </div>
      </main>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display text-2xl">{authMode === "signup" ? "Join the exchange" : "Welcome back"}</DialogTitle><DialogDescription>{authMode === "signup" ? "A direct connection to fresh local food." : "Sign in to your FarmConnect workspace."}</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 rounded-full bg-muted p-1"><Button type="button" variant="ghost" className={`h-9 rounded-full ${authRole === "buyer" ? "bg-card shadow-sm" : "text-muted-foreground"}`} onClick={() => setAuthRole("buyer")}>Buyer</Button><Button type="button" variant="ghost" className={`h-9 rounded-full ${authRole === "farmer" ? "bg-card shadow-sm" : "text-muted-foreground"}`} onClick={() => setAuthRole("farmer")}>Farmer</Button></div>
          <form onSubmit={(event) => void handleAuth(event)} className="space-y-3">
            {authMode === "signup" && <><Input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" aria-label="Your name" />{authRole === "farmer" && <><Input value={farmName} onChange={(event) => setFarmName(event.target.value)} placeholder="Farm or business name" aria-label="Farm or business name" /><Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Town or region" aria-label="Town or region" /></>}</>}
            <Input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" aria-label="Email address" />
            <Input required minLength={6} type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" aria-label="Password" />
            {authMessage && <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{authMessage}</p>}
            <Button type="submit" disabled={authBusy} className="w-full rounded-full">{authBusy ? "Please wait…" : authMode === "signup" ? `Create ${authRole} account` : "Sign in"}</Button>
          </form>
          <div className="relative flex items-center"><div className="w-full border-t border-border" /><span className="absolute left-1/2 -translate-x-1/2 bg-background px-2 text-xs text-muted-foreground">or</span></div>
          <Button type="button" variant="outline" disabled={authBusy} className="w-full rounded-full" onClick={() => void handleGoogle()}>Continue with Google</Button>
          <p className="text-center text-sm text-muted-foreground">{authMode === "signup" ? "Already growing with us?" : "New to FarmConnect?"}{" "}<Button type="button" variant="link" className="h-auto p-0 text-primary" onClick={() => { setAuthMode(authMode === "signup" ? "signin" : "signup"); setAuthMessage(""); }}>{authMode === "signup" ? "Sign in" : "Create account"}</Button></p>
        </DialogContent>
      </Dialog>

      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md"><DialogHeader><DialogTitle className="font-display text-2xl">Your basket</DialogTitle><DialogDescription>{cartCount} fresh {cartCount === 1 ? "item" : "items"} from local growers</DialogDescription></DialogHeader>
          {!cart.length ? <div className="rounded-xl bg-muted/70 p-8 text-center"><ShoppingBag className="mx-auto text-muted-foreground" /><p className="mt-3 font-medium">Your basket is empty</p><p className="mt-1 text-sm text-muted-foreground">Add something fresh from today’s harvest.</p></div> : <>
            <ul className="space-y-4">{cart.map(({ product, quantity }) => <li key={product.id} className="flex items-center gap-3"><img src={imageFor(product)} alt="" loading="lazy" width={816} height={816} className="size-14 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{product.name}</p><p className="text-sm text-muted-foreground">{currency(product.price)} / {product.unit}</p></div><div className="flex items-center gap-1"><Button variant="outline" size="icon" className="size-8 rounded-full" aria-label={`Remove one ${product.name}`} onClick={() => void changeCartQuantity(product.id, -1)}><span aria-hidden="true">−</span></Button><span className="w-7 text-center text-sm">{quantity}</span><Button variant="outline" size="icon" className="size-8 rounded-full" aria-label={`Add one ${product.name}`} onClick={() => void changeCartQuantity(product.id, 1)}><Plus size={13} /></Button></div><span className="w-16 text-right text-sm font-semibold">{currency(product.price * quantity)}</span></li>)}</ul>
            <div className="border-t border-border pt-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Subtotal</span><span className="font-display text-xl font-semibold">{currency(subtotal)}</span></div><p className="mt-1 text-xs text-muted-foreground">Delivery details are confirmed with your grower.</p><Button className="mt-4 w-full rounded-full" onClick={() => void checkout()}>Place order <ChevronRight size={16} /></Button></div>
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle className="font-display text-2xl">{editingProduct ? "Edit listing" : "List a harvest"}</DialogTitle><DialogDescription>Share what’s ready from your farm.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void saveProduct(event)} className="space-y-3"><Input required value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Produce name" aria-label="Produce name" /><Input value={productDescription} onChange={(event) => setProductDescription(event.target.value)} placeholder="A short description" aria-label="Description" /><div className="grid grid-cols-2 gap-3"><Input required min="0.01" step="0.01" type="number" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} placeholder="Price per unit" aria-label="Price per unit" /><Input required min="0" step="1" type="number" value={productQuantity} onChange={(event) => setProductQuantity(event.target.value)} placeholder="Available quantity" aria-label="Available quantity" /></div><label className="block text-sm font-medium">Category<select className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={productCategory} onChange={(event) => setProductCategory(event.target.value)}><option>Vegetables</option><option>Fruit</option><option>Pantry</option><option>Dairy</option></select></label><Button disabled={saving} className="w-full rounded-full">{saving ? "Saving…" : editingProduct ? "Save changes" : "Publish listing"}</Button></form>
        </DialogContent>
      </Dialog>

      {user && <div className="fixed bottom-4 right-4 z-20"><Button variant="outline" size="sm" className="rounded-full bg-background/90 shadow-sm" onClick={() => void signOut()}><LogOut size={14} /> Sign out</Button></div>}
      <div className="sr-only" aria-live="polite">{user ? `Signed in as ${user.email ?? profile.display_name}` : "Browsing as a guest"}</div>
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <Button variant="ghost" className={`h-10 w-full justify-start rounded-xl ${active ? "bg-primary/10 text-primary" : "text-muted-foreground"}`} onClick={onClick}>{icon}<span className="ml-2">{label}</span></Button>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl bg-card/80 p-4 ring-1 ring-border/60"><p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-semibold">{value}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p></div>;
}

function OrderList({ orders, mode, onAdvance, onSignIn, demo }: { orders: Order[]; mode: Workspace; onAdvance: (order: Order, status: string) => void; onSignIn: () => void; demo: boolean }) {
  if (!orders.length) return <div className="rounded-2xl bg-card/75 p-7 text-center ring-1 ring-border/60"><PackageCheck className="mx-auto text-muted-foreground" /><h2 className="mt-3 font-display text-lg font-semibold">{demo ? "Your farm orders" : "No orders yet"}</h2><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{demo ? "Sign in as a farmer to manage incoming orders and update delivery progress." : mode === "buyer" ? "Your purchases and delivery tracking will appear here." : "New buyer orders will appear here when a harvest sells."}</p>{demo && <Button className="mt-4 rounded-full" onClick={onSignIn}>Sign in as a farmer</Button>}</div>;
  return <div className="space-y-3">{orders.map((order) => {
    const index = stageIndex(order.status);
    const nextStatus = order.status === "pending" ? "accepted" : order.status === "accepted" ? "packed" : order.status === "packed" ? "shipped" : order.status === "shipped" ? "out_for_delivery" : order.status === "out_for_delivery" ? "delivered" : null;
    return <article key={order.id} className="rounded-2xl bg-card/80 p-4 ring-1 ring-border/60 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">Order #{order.id.slice(0, 8)}</p><h2 className="mt-1 font-display font-semibold">{order.product_name} × {order.quantity}</h2><p className="mt-1 text-sm text-muted-foreground">{new Date(order.order_date).toLocaleDateString()} · {currency(order.total_price)}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{statusLabels[order.status] ?? order.status}</span></div>
      {order.status !== "cancelled" && <div className="mt-5"><div className="flex items-center gap-1.5">{orderStages.map((stage, step) => <div key={stage} className={`h-1.5 flex-1 rounded-full ${step <= index ? "bg-primary" : "bg-muted"}`} />)}</div><div className="mt-2 grid grid-cols-5 gap-1 text-[10px] leading-tight text-muted-foreground">{orderStages.map((stage) => <span key={stage}>{stage}</span>)}</div></div>}
      {mode === "farmer" && nextStatus && <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-muted-foreground">Move order forward</span><Button size="sm" className="rounded-full" onClick={() => onAdvance(order, nextStatus)}>{order.status === "pending" ? "Accept order" : `Mark ${statusLabels[nextStatus].toLowerCase()}`}<ChevronRight size={14} /></Button></div>}
    </article>;
  })}</div>;
}

function DeliveryCard({ order }: { order?: Order }) {
  if (!order) return <section className="rounded-2xl bg-card/75 p-5 ring-1 ring-border/60"><div className="flex items-center gap-2"><Truck size={17} className="text-primary" /><h2 className="font-display font-semibold">Delivery tracking</h2></div><p className="mt-2 text-sm text-muted-foreground">Your order journey will appear here after checkout.</p></section>;
  const index = stageIndex(order.status);
  return <section className="rounded-2xl bg-card/75 p-5 ring-1 ring-border/60"><div className="flex items-center justify-between"><div><h2 className="font-display font-semibold">Delivery tracking</h2><p className="mt-1 text-sm text-muted-foreground">Order #{order.id.slice(0, 8)}</p></div><Truck size={18} className="text-primary" /></div><div className="mt-5 space-y-0">{orderStages.map((stage, step) => <div key={stage} className="flex gap-3"><div className="flex flex-col items-center"><div className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${step <= index ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>{step < index ? <Check size={12} /> : step + 1}</div>{step < orderStages.length - 1 && <div className={`w-px flex-1 ${step < index ? "bg-primary/50" : "bg-border"}`} />}</div><div className="pb-4"><p className={`text-sm font-medium ${step <= index ? "text-foreground" : "text-muted-foreground"}`}>{stage}</p>{step === index && <p className="mt-0.5 text-xs text-muted-foreground">Current status</p>}</div></div>)}</div></section>;
}

function Inventory({ products, onEdit, onDelete, onAdd, demo, onSignIn }: { products: MarketProduct[]; onEdit: (product: MarketProduct) => void; onDelete: (product: MarketProduct) => void; onAdd: () => void; demo: boolean; onSignIn: () => void }) {
  return <div className="rounded-2xl bg-card/80 ring-1 ring-border/60"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4"><div><h2 className="font-display font-semibold">Your produce</h2><p className="text-sm text-muted-foreground">{products.filter((product) => product.quantity < 10).length} listings need a stock check</p></div><Button className="rounded-full" onClick={demo ? onSignIn : onAdd}><Plus size={15} /> Add listing</Button></div>{products.length ? <div className="divide-y divide-border/60">{products.map((product) => <div key={product.id} className="flex items-center gap-3 p-3 sm:px-4"><img src={imageFor(product)} alt="" loading="lazy" width={816} height={816} className="size-12 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{product.name}</p><p className="text-sm text-muted-foreground">{currency(product.price)} / {product.unit}</p></div><span className={`hidden text-sm sm:block ${product.quantity < 10 ? "text-gold" : "text-muted-foreground"}`}>{product.quantity} in stock</span>{product.quantity < 10 && <span className="rounded-full bg-gold/15 px-2 py-1 text-[11px] font-medium text-gold">Low stock</span>}<Button variant="outline" size="sm" className="rounded-full" onClick={() => demo ? onSignIn() : onEdit(product)}>Edit</Button>{!demo && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Delete ${product.name}`} onClick={() => onDelete(product)}><X size={15} /></Button>}</div>)}</div> : <p className="p-8 text-center text-sm text-muted-foreground">No listings yet. Add your first harvest.</p>}</div>;
}

function ProfileForm({ profile, displayName, farmName, location, setDisplayName, setFarmName, setLocation, onSubmit, saving, signedIn, onSignIn }: { profile: { display_name: string; farm_name: string; location: string }; displayName: string; farmName: string; location: string; setDisplayName: (value: string) => void; setFarmName: (value: string) => void; setLocation: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; saving: boolean; signedIn: boolean; onSignIn: () => void }) {
  return <div className="max-w-2xl rounded-2xl bg-card/80 p-5 ring-1 ring-border/60 sm:p-7"><div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Account settings</p><h2 className="mt-1 font-display text-2xl font-semibold">Your profile</h2><p className="mt-1 text-sm text-muted-foreground">Keep your grower and buyer details up to date.</p></div>{signedIn ? <form onSubmit={onSubmit} className="space-y-4"><label className="block text-sm font-medium">Display name<Input required className="mt-1.5" value={displayName || profile.display_name} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" /></label><label className="block text-sm font-medium">Farm or business name<Input className="mt-1.5" value={farmName || profile.farm_name} onChange={(event) => setFarmName(event.target.value)} placeholder="Farm or business name" /></label><label className="block text-sm font-medium">Town or region<Input className="mt-1.5" value={location || profile.location} onChange={(event) => setLocation(event.target.value)} placeholder="Your location" /></label><Button disabled={saving} className="rounded-full">{saving ? "Saving…" : "Save profile"}</Button></form> : <div className="rounded-xl bg-muted/70 p-5"><p className="text-sm text-muted-foreground">Sign in to create and manage your FarmConnect profile.</p><Button className="mt-4 rounded-full" onClick={onSignIn}>Sign in</Button></div>}</div>;
}
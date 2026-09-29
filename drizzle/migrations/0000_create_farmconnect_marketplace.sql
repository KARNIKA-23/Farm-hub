CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'farmer', 'buyer');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  farm_name TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can create their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can choose a marketplace role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND role IN ('farmer', 'buyer'));

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  unit TEXT NOT NULL DEFAULT 'lb',
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  category TEXT NOT NULL DEFAULT 'Vegetables',
  image_url TEXT NOT NULL DEFAULT '',
  seller_name TEXT NOT NULL DEFAULT 'Local grower',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can browse active produce" ON public.products FOR SELECT TO anon, authenticated USING (is_active = true OR farmer_id = auth.uid());
CREATE POLICY "Farmers can list produce" ON public.products FOR INSERT TO authenticated WITH CHECK (farmer_id = auth.uid() AND public.has_role(auth.uid(), 'farmer'));
CREATE POLICY "Farmers can update their produce" ON public.products FOR UPDATE TO authenticated USING (farmer_id = auth.uid() AND public.has_role(auth.uid(), 'farmer')) WITH CHECK (farmer_id = auth.uid() AND public.has_role(auth.uid(), 'farmer'));
CREATE POLICY "Farmers can remove their produce" ON public.products FOR DELETE TO authenticated USING (farmer_id = auth.uid() AND public.has_role(auth.uid(), 'farmer'));

INSERT INTO public.products (name, description, price, unit, quantity, category, image_url, seller_name) VALUES
('Heirloom Tomatoes', 'Sun-ripened, mixed heirloom varieties, picked this morning.', 6.50, 'lb', 42, 'Vegetables', 'tomatoes', 'Willow Creek Farm'),
('Lacinato Kale', 'Tender dark leaves, harvested at first light.', 3.20, 'bunch', 8, 'Vegetables', 'kale', 'Greenfield Acres'),
('Raw Wildflower Honey', 'Small-batch, unfiltered honey from meadow blossoms.', 14.00, 'jar', 24, 'Pantry', 'honey', 'Meadow Apiary');

CREATE TABLE public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyers manage their cart" ON public.cart_items FOR ALL TO authenticated USING (buyer_id = auth.uid() AND public.has_role(auth.uid(), 'buyer')) WITH CHECK (buyer_id = auth.uid() AND public.has_role(auth.uid(), 'buyer'));

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL,
  farmer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'item',
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','packed','shipped','out_for_delivery','delivered','cancelled')),
  order_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivery_date TIMESTAMPTZ
);
GRANT SELECT, INSERT ON public.orders TO authenticated;
GRANT UPDATE (status, delivery_date) ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Order parties can read their orders" ON public.orders FOR SELECT TO authenticated USING (buyer_id = auth.uid() OR farmer_id = auth.uid());
CREATE POLICY "Buyers can place their own orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid() AND public.has_role(auth.uid(), 'buyer'));
CREATE POLICY "Farmers can update fulfillment status" ON public.orders FOR UPDATE TO authenticated USING (farmer_id = auth.uid() AND public.has_role(auth.uid(), 'farmer')) WITH CHECK (farmer_id = auth.uid() AND public.has_role(auth.uid(), 'farmer'));

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Message participants can read conversations" ON public.messages FOR SELECT TO authenticated USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "Users can send messages as themselves" ON public.messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());

CREATE INDEX products_farmer_active_idx ON public.products (farmer_id, is_active);
CREATE INDEX cart_items_buyer_idx ON public.cart_items (buyer_id);
CREATE INDEX orders_buyer_date_idx ON public.orders (buyer_id, order_date DESC);
CREATE INDEX orders_farmer_date_idx ON public.orders (farmer_id, order_date DESC);
CREATE INDEX messages_participants_idx ON public.messages (sender_id, receiver_id, created_at);
CREATE TYPE "public"."customer_source" AS ENUM('instagram', 'whatsapp', 'referral', 'exhibition', 'website', 'other');--> statement-breakpoint
CREATE TYPE "public"."customisation_input" AS ENUM('none', 'text', 'choice');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('flat', 'percent');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('raw_materials', 'packaging', 'courier', 'marketing', 'tools', 'other');--> statement-breakpoint
CREATE TYPE "public"."list_kind" AS ENUM('product_type', 'colour', 'design', 'aggregator');--> statement-breakpoint
CREATE TYPE "public"."order_channel" AS ENUM('instagram', 'whatsapp', 'phone', 'in_person', 'website', 'other');--> statement-breakpoint
CREATE TYPE "public"."order_priority" AS ENUM('normal', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('in_production', 'ready_for_pickup', 'docket_raised', 'in_transit', 'delivered', 'on_hold', 'cancelled', 'returned');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('upi', 'cash', 'bank_transfer', 'card', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('advance', 'balance', 'refund');--> statement-breakpoint
CREATE TYPE "public"."shipment_booking" AS ENUM('direct', 'aggregator');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('docket_raised', 'in_transit', 'delivered', 'returned');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"due_soon_days" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "app_settings_single_row" CHECK ("app_settings"."id" = 1),
	CONSTRAINT "app_settings_due_soon_days" CHECK ("app_settings"."due_soon_days" BETWEEN 0 AND 60)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "categories_name" CHECK ("categories"."name" = btrim("categories"."name") AND "categories"."name" <> '')
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"landmark" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"pin" text NOT NULL,
	"country" text DEFAULT 'India' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "customer_addresses_pin" CHECK ("customer_addresses"."pin" ~ '^[1-9][0-9]{5}$')
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"mobile" text NOT NULL,
	"alt_mobile" text,
	"email" text,
	"instagram_handle" text,
	"source" "customer_source",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "customers_number_unique" UNIQUE("number"),
	CONSTRAINT "customers_mobile_unique" UNIQUE("mobile"),
	CONSTRAINT "customers_instagram_handle_unique" UNIQUE("instagram_handle"),
	CONSTRAINT "customers_number" CHECK ("customers"."number" > 0),
	CONSTRAINT "customers_first_name" CHECK ("customers"."first_name" = btrim("customers"."first_name") AND "customers"."first_name" <> ''),
	CONSTRAINT "customers_mobile" CHECK ("customers"."mobile" ~ '^[0-9]{10}$'),
	CONSTRAINT "customers_alt_mobile" CHECK ("customers"."alt_mobile" ~ '^[0-9]{10}$'),
	CONSTRAINT "customers_email" CHECK ("customers"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
	CONSTRAINT "customers_instagram_handle" CHECK ("customers"."instagram_handle" ~ '^[a-z0-9._]{1,30}$')
);
--> statement-breakpoint
CREATE TABLE "customisation_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "customisation_choices_name" CHECK ("customisation_choices"."name" = btrim("customisation_choices"."name") AND "customisation_choices"."name" <> '')
);
--> statement-breakpoint
CREATE TABLE "customisation_option_categories" (
	"option_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "customisation_option_categories_option_id_category_id_pk" PRIMARY KEY("option_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "customisation_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"input_type" "customisation_input" NOT NULL,
	"max_length" integer,
	"extra_price" integer DEFAULT 0 NOT NULL,
	"extra_cost" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "customisation_options_name" CHECK ("customisation_options"."name" = btrim("customisation_options"."name") AND "customisation_options"."name" <> ''),
	CONSTRAINT "customisation_options_extra_price" CHECK ("customisation_options"."extra_price" >= 0),
	CONSTRAINT "customisation_options_extra_cost" CHECK ("customisation_options"."extra_cost" >= 0),
	CONSTRAINT "customisation_options_max_length" CHECK (("customisation_options"."input_type" = 'text') = ("customisation_options"."max_length" IS NOT NULL) AND ("customisation_options"."max_length" IS NULL OR "customisation_options"."max_length" BETWEEN 1 AND 500))
);
--> statement-breakpoint
CREATE TABLE "delivery_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tracking_url_template" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "delivery_partners_name" CHECK ("delivery_partners"."name" = btrim("delivery_partners"."name") AND "delivery_partners"."name" <> ''),
	CONSTRAINT "delivery_partners_tracking_url" CHECK ("delivery_partners"."tracking_url_template" ~ '^https?://' AND position('{awb}' in "delivery_partners"."tracking_url_template") > 0)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spent_on" date NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"category" "expense_category" NOT NULL,
	"paid_via" "payment_mode" NOT NULL,
	"receipt_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "expenses_amount" CHECK ("expenses"."amount" > 0),
	CONSTRAINT "expenses_description" CHECK ("expenses"."description" = btrim("expenses"."description") AND "expenses"."description" <> '')
);
--> statement-breakpoint
CREATE TABLE "id_counters" (
	"name" text PRIMARY KEY NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "id_counters_last_value" CHECK ("id_counters"."last_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "list_kind" NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "list_items_name" CHECK ("list_items"."name" = btrim("list_items"."name") AND "list_items"."name" <> '')
);
--> statement-breakpoint
CREATE TABLE "order_item_customisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"choice_id" uuid,
	"text_value" text,
	"price" integer NOT NULL,
	"cost" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "order_item_customisations_option_unique" UNIQUE("order_item_id","option_id"),
	CONSTRAINT "order_item_customisations_price" CHECK ("order_item_customisations"."price" >= 0),
	CONSTRAINT "order_item_customisations_cost" CHECK ("order_item_customisations"."cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"production_stage_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"unit_cost" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "order_items_quantity" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price" CHECK ("order_items"."unit_price" >= 0),
	CONSTRAINT "order_items_unit_cost" CHECK ("order_items"."unit_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_date" date NOT NULL,
	"promised_date" date NOT NULL,
	"priority" "order_priority" DEFAULT 'normal' NOT NULL,
	"channel" "order_channel",
	"status" "order_status" DEFAULT 'in_production' NOT NULL,
	"discount_type" "discount_type",
	"discount_flat" integer DEFAULT 0 NOT NULL,
	"discount_percent_bp" integer DEFAULT 0 NOT NULL,
	"shipping_charged" integer DEFAULT 0 NOT NULL,
	"delivery_line1" text NOT NULL,
	"delivery_line2" text,
	"delivery_landmark" text,
	"delivery_city" text NOT NULL,
	"delivery_state" text NOT NULL,
	"delivery_pin" text NOT NULL,
	"delivery_country" text DEFAULT 'India' NOT NULL,
	"delivered_date" date,
	"cancel_reason" text,
	"refund_owed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "orders_code_unique" UNIQUE("code"),
	CONSTRAINT "orders_code" CHECK ("orders"."code" ~ '^HMU-[0-9]{4}-[0-9]{4,}$'),
	CONSTRAINT "orders_promised_after_order" CHECK ("orders"."promised_date" >= "orders"."order_date"),
	CONSTRAINT "orders_discount_flat" CHECK ("orders"."discount_flat" >= 0),
	CONSTRAINT "orders_discount_percent" CHECK ("orders"."discount_percent_bp" BETWEEN 0 AND 10000),
	CONSTRAINT "orders_discount_type" CHECK (CASE "orders"."discount_type"
            WHEN 'flat' THEN "orders"."discount_percent_bp" = 0
            WHEN 'percent' THEN "orders"."discount_flat" = 0
            ELSE "orders"."discount_flat" = 0 AND "orders"."discount_percent_bp" = 0
          END),
	CONSTRAINT "orders_shipping_charged" CHECK ("orders"."shipping_charged" >= 0),
	CONSTRAINT "orders_delivery_pin" CHECK ("orders"."delivery_pin" ~ '^[1-9][0-9]{5}$'),
	CONSTRAINT "orders_delivered_date" CHECK ("orders"."status" <> 'delivered' OR "orders"."delivered_date" IS NOT NULL),
	CONSTRAINT "orders_cancel_reason" CHECK ("orders"."status" <> 'cancelled' OR btrim(coalesce("orders"."cancel_reason", '')) <> '')
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"paid_on" date NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"type" "payment_type" NOT NULL,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "payments_amount_sign" CHECK (CASE WHEN "payments"."type" = 'refund' THEN "payments"."amount" < 0 ELSE "payments"."amount" > 0 END)
);
--> statement-breakpoint
CREATE TABLE "product_customisation_options" (
	"product_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "product_customisation_options_product_id_option_id_pk" PRIMARY KEY("product_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "product_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "product_photos_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "product_photos_position" CHECK ("product_photos"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "production_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "production_stages_category_id_unique" UNIQUE("category_id","id"),
	CONSTRAINT "production_stages_name" CHECK ("production_stages"."name" = btrim("production_stages"."name") AND "production_stages"."name" <> ''),
	CONSTRAINT "production_stages_position" CHECK ("production_stages"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"type_id" uuid,
	"colour_id" uuid,
	"design_id" uuid,
	"length_mm" integer,
	"width_mm" integer,
	"height_mm" integer,
	"weight_g" integer,
	"price" integer NOT NULL,
	"cost" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "products_sku" CHECK ("products"."sku" = btrim("products"."sku") AND "products"."sku" <> ''),
	CONSTRAINT "products_name" CHECK ("products"."name" = btrim("products"."name") AND "products"."name" <> ''),
	CONSTRAINT "products_price" CHECK ("products"."price" >= 0),
	CONSTRAINT "products_cost" CHECK ("products"."cost" >= 0),
	CONSTRAINT "products_length" CHECK ("products"."length_mm" > 0),
	CONSTRAINT "products_width" CHECK ("products"."width_mm" > 0),
	CONSTRAINT "products_height" CHECK ("products"."height_mm" > 0),
	CONSTRAINT "products_weight" CHECK ("products"."weight_g" > 0)
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"booked_via" "shipment_booking" NOT NULL,
	"aggregator_id" uuid,
	"delivery_partner_id" uuid NOT NULL,
	"awb" text,
	"shipping_cost" integer DEFAULT 0 NOT NULL,
	"weight_g" integer,
	"length_mm" integer,
	"width_mm" integer,
	"height_mm" integer,
	"dispatch_date" date,
	"delivered_date" date,
	"status" "shipment_status" DEFAULT 'docket_raised' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "shipments_partner_awb_unique" UNIQUE("delivery_partner_id","awb"),
	CONSTRAINT "shipments_aggregator" CHECK (("shipments"."booked_via" = 'aggregator') = ("shipments"."aggregator_id" IS NOT NULL)),
	CONSTRAINT "shipments_awb" CHECK ("shipments"."awb" = btrim("shipments"."awb") AND "shipments"."awb" <> ''),
	CONSTRAINT "shipments_awb_required" CHECK ("shipments"."status" = 'docket_raised' OR "shipments"."awb" IS NOT NULL),
	CONSTRAINT "shipments_shipping_cost" CHECK ("shipments"."shipping_cost" >= 0),
	CONSTRAINT "shipments_weight" CHECK ("shipments"."weight_g" > 0),
	CONSTRAINT "shipments_length" CHECK ("shipments"."length_mm" > 0),
	CONSTRAINT "shipments_width" CHECK ("shipments"."width_mm" > 0),
	CONSTRAINT "shipments_height" CHECK ("shipments"."height_mm" > 0)
);
--> statement-breakpoint
CREATE TABLE "status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid,
	"from_status" "order_status",
	"to_status" "order_status",
	"from_stage_id" uuid,
	"to_stage_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "status_history_kind" CHECK (("status_history"."to_status" IS NOT NULL AND "status_history"."to_stage_id" IS NULL AND "status_history"."from_stage_id" IS NULL)
          OR ("status_history"."to_stage_id" IS NOT NULL AND "status_history"."to_status" IS NULL AND "status_history"."from_status" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customisation_choices" ADD CONSTRAINT "customisation_choices_option_id_customisation_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."customisation_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customisation_choices" ADD CONSTRAINT "customisation_choices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customisation_choices" ADD CONSTRAINT "customisation_choices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customisation_option_categories" ADD CONSTRAINT "customisation_option_categories_option_id_customisation_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."customisation_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customisation_option_categories" ADD CONSTRAINT "customisation_option_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customisation_option_categories" ADD CONSTRAINT "customisation_option_categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customisation_option_categories" ADD CONSTRAINT "customisation_option_categories_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customisation_options" ADD CONSTRAINT "customisation_options_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customisation_options" ADD CONSTRAINT "customisation_options_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_partners" ADD CONSTRAINT "delivery_partners_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_partners" ADD CONSTRAINT "delivery_partners_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_customisations" ADD CONSTRAINT "order_item_customisations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_customisations" ADD CONSTRAINT "order_item_customisations_option_id_customisation_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."customisation_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_customisations" ADD CONSTRAINT "order_item_customisations_choice_id_customisation_choices_id_fk" FOREIGN KEY ("choice_id") REFERENCES "public"."customisation_choices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_customisations" ADD CONSTRAINT "order_item_customisations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_customisations" ADD CONSTRAINT "order_item_customisations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_stage_in_category_fk" FOREIGN KEY ("category_id","production_stage_id") REFERENCES "public"."production_stages"("category_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_customisation_options" ADD CONSTRAINT "product_customisation_options_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_customisation_options" ADD CONSTRAINT "product_customisation_options_option_id_customisation_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."customisation_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_customisation_options" ADD CONSTRAINT "product_customisation_options_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_customisation_options" ADD CONSTRAINT "product_customisation_options_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stages" ADD CONSTRAINT "production_stages_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stages" ADD CONSTRAINT "production_stages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stages" ADD CONSTRAINT "production_stages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_type_id_list_items_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_colour_id_list_items_id_fk" FOREIGN KEY ("colour_id") REFERENCES "public"."list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_design_id_list_items_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_aggregator_id_list_items_id_fk" FOREIGN KEY ("aggregator_id") REFERENCES "public"."list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_delivery_partner_id_delivery_partners_id_fk" FOREIGN KEY ("delivery_partner_id") REFERENCES "public"."delivery_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_from_stage_id_production_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."production_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_to_stage_id_production_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."production_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_unique" ON "categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_default" ON "customer_addresses" USING btree ("customer_id") WHERE "customer_addresses"."is_default";--> statement-breakpoint
CREATE INDEX "customers_first_name_idx" ON "customers" USING btree (lower("first_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "customisation_choices_option_name_unique" ON "customisation_choices" USING btree ("option_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "customisation_options_name_unique" ON "customisation_options" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_partners_name_unique" ON "delivery_partners" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "expenses_spent_on_idx" ON "expenses" USING btree ("spent_on");--> statement-breakpoint
CREATE UNIQUE INDEX "list_items_kind_name_unique" ON "list_items" USING btree ("kind",lower("name"));--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_status_promised_idx" ON "orders" USING btree ("status","promised_date");--> statement-breakpoint
CREATE INDEX "orders_delivered_date_idx" ON "orders" USING btree ("delivered_date");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "product_photos_product_idx" ON "product_photos" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_stages_category_name_unique" ON "production_stages" USING btree ("category_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree (lower("sku"));--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipments_awb_idx" ON "shipments" USING btree ("awb");--> statement-breakpoint
CREATE INDEX "status_history_order_idx" ON "status_history" USING btree ("order_id","created_at");
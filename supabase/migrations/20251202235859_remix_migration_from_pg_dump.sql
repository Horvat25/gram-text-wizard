CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: publish_scheduled_posts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_scheduled_posts() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  post_record RECORD;
BEGIN
  -- Find posts that should be published
  FOR post_record IN 
    SELECT id FROM posts 
    WHERE status = 'scheduled' 
    AND scheduled_for <= NOW()
  LOOP
    -- Update post status and metrics
    UPDATE posts SET
      status = 'published',
      published_at = NOW(),
      likes_count = FLOOR(RANDOM() * 5000 + 500)::INTEGER,
      comments_count = FLOOR(RANDOM() * 200 + 20)::INTEGER,
      saves_count = FLOOR(RANDOM() * 800 + 100)::INTEGER,
      reach = FLOOR(RANDOM() * 15000 + 2000)::INTEGER
    WHERE id = post_record.id;
  END LOOP;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id text NOT NULL,
    backup_type text NOT NULL,
    file_size bigint,
    created_at timestamp with time zone DEFAULT now(),
    download_url text,
    metadata jsonb,
    CONSTRAINT backups_backup_type_check CHECK ((backup_type = ANY (ARRAY['full'::text, 'data_only'::text])))
);


--
-- Name: instagram_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_credentials (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    access_token text,
    instagram_user_id text,
    is_connected boolean DEFAULT false,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    caption text NOT NULL,
    hashtags text[],
    status text DEFAULT 'draft'::text NOT NULL,
    scheduled_for timestamp with time zone,
    published_at timestamp with time zone,
    instagram_post_id text,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    image_url text,
    likes_count integer DEFAULT 0,
    comments_count integer DEFAULT 0,
    saves_count integer DEFAULT 0,
    reach integer DEFAULT 0,
    post_type text DEFAULT 'engajamento'::text,
    CONSTRAINT posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text, 'failed'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    full_name text,
    instagram_username text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_name text,
    brand_logo_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: backups backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backups
    ADD CONSTRAINT backups_pkey PRIMARY KEY (id);


--
-- Name: instagram_credentials instagram_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_credentials
    ADD CONSTRAINT instagram_credentials_pkey PRIMARY KEY (id);


--
-- Name: instagram_credentials instagram_credentials_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_credentials
    ADD CONSTRAINT instagram_credentials_user_id_key UNIQUE (user_id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: idx_backups_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_backups_created_at ON public.backups USING btree (created_at DESC);


--
-- Name: instagram_credentials update_instagram_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_credentials_updated_at BEFORE UPDATE ON public.instagram_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: posts update_posts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: backups Anyone can create backups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create backups" ON public.backups FOR INSERT WITH CHECK (true);


--
-- Name: posts Anyone can create posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create posts" ON public.posts FOR INSERT WITH CHECK (true);


--
-- Name: backups Anyone can delete backups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete backups" ON public.backups FOR DELETE USING (true);


--
-- Name: posts Anyone can delete posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete posts" ON public.posts FOR DELETE USING (true);


--
-- Name: settings Anyone can insert settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert settings" ON public.settings FOR INSERT WITH CHECK (true);


--
-- Name: posts Anyone can update posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update posts" ON public.posts FOR UPDATE USING (true);


--
-- Name: settings Anyone can update settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update settings" ON public.settings FOR UPDATE USING (true);


--
-- Name: backups Anyone can view backups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view backups" ON public.backups FOR SELECT USING (true);


--
-- Name: posts Anyone can view posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view posts" ON public.posts FOR SELECT USING (true);


--
-- Name: settings Anyone can view settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view settings" ON public.settings FOR SELECT USING (true);


--
-- Name: instagram_credentials Users can insert their own credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own credentials" ON public.instagram_credentials FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: instagram_credentials Users can update their own credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own credentials" ON public.instagram_credentials FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: instagram_credentials Users can view their own credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own credentials" ON public.instagram_credentials FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: backups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



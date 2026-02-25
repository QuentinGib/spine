
-- Create library table
CREATE TABLE public.library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own library" ON public.library FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own books" ON public.library FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own books" ON public.library FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own books" ON public.library FOR UPDATE USING (auth.uid() = user_id);

-- Create active_recommendations table
CREATE TABLE public.active_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Sure Thing', 'Wildcard', 'Deep Dive')),
  recommended_book_title TEXT NOT NULL,
  recommended_book_author TEXT NOT NULL,
  blurb TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, type)
);

ALTER TABLE public.active_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recommendations" ON public.active_recommendations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own recommendations" ON public.active_recommendations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own recommendations" ON public.active_recommendations FOR DELETE USING (auth.uid() = user_id);

-- Create rejected_recommendations table
CREATE TABLE public.rejected_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  rejected_title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rejected_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own rejections" ON public.rejected_recommendations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own rejections" ON public.rejected_recommendations FOR INSERT WITH CHECK (auth.uid() = user_id);

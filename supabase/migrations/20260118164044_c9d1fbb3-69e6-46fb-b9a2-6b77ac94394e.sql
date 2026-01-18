-- Create table for agent chat memory
CREATE TABLE public.agent_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  actions jsonb DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own chat messages" 
ON public.agent_chat_messages 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chat messages" 
ON public.agent_chat_messages 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat messages" 
ON public.agent_chat_messages 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_agent_chat_messages_user_id ON public.agent_chat_messages(user_id);
CREATE INDEX idx_agent_chat_messages_created_at ON public.agent_chat_messages(created_at DESC);
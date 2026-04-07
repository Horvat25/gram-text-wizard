-- Move Instagram account from "Menino baum" to "Workspace Principal"
UPDATE public.instagram_accounts 
SET workspace_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE workspace_id = '86950d5f-e821-494d-bed8-9f17f77e3e27';

-- Move snapshots (they have zeros but keep for history)
UPDATE public.agent_strategy_snapshots 
SET workspace_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE workspace_id = '86950d5f-e821-494d-bed8-9f17f77e3e27';

-- Move any chat messages
UPDATE public.agent_chat_messages 
SET workspace_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE workspace_id = '86950d5f-e821-494d-bed8-9f17f77e3e27';

-- Move any proactive messages
UPDATE public.agent_proactive_messages 
SET workspace_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE workspace_id = '86950d5f-e821-494d-bed8-9f17f77e3e27';

-- Move any agent decisions
UPDATE public.agent_decisions 
SET workspace_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE workspace_id = '86950d5f-e821-494d-bed8-9f17f77e3e27';

-- Move any execution reports
UPDATE public.agent_execution_reports 
SET workspace_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE workspace_id = '86950d5f-e821-494d-bed8-9f17f77e3e27';

-- Move RSS items
UPDATE public.rss_items 
SET workspace_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE workspace_id = '86950d5f-e821-494d-bed8-9f17f77e3e27';

-- Move settings
UPDATE public.settings 
SET workspace_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE workspace_id = '86950d5f-e821-494d-bed8-9f17f77e3e27';

-- Move affiliate links
UPDATE public.affiliate_links 
SET workspace_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE workspace_id = '86950d5f-e821-494d-bed8-9f17f77e3e27';

-- Move TikTok accounts
UPDATE public.tiktok_accounts 
SET workspace_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE workspace_id = '86950d5f-e821-494d-bed8-9f17f77e3e27';

-- Remove workspace member
DELETE FROM public.workspace_members 
WHERE workspace_id = '86950d5f-e821-494d-bed8-9f17f77e3e27';

-- Delete the empty workspace
DELETE FROM public.workspaces 
WHERE id = '86950d5f-e821-494d-bed8-9f17f77e3e27';
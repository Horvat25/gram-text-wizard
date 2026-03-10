UPDATE agent_context SET 
  content_distribution_videos = 3,
  content_distribution_carousels = 2, 
  content_distribution_news = 4,
  content_distribution_images = 2,
  updated_at = now()
WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
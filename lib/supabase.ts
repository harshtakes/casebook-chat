import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://qznmqahmmtczrbcbtuxz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6bm1xYWhtbXRjenJiY2J0dXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjEzMzksImV4cCI6MjA5MTI5NzMzOX0.rtr89IoBWe2wW4UekZBo6UNYIj5x2-5o7PLjvtK-HmM'
)
-- 010: UPDATE RANKING FUNCTION
-- Exclude drafts from leaderboards

CREATE OR REPLACE FUNCTION get_top_contributors(lim INTEGER DEFAULT 10)
RETURNS TABLE (userId UUID, count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT p.user_id as userId, COUNT(*) as count
  FROM prices p
  JOIN receipts r ON p.receipt_id = r.id
  WHERE r.status = 'complete' -- Only count completed receipts
  AND r.is_deleted = false
  GROUP BY p.user_id
  ORDER BY count DESC
  LIMIT lim;
$$;

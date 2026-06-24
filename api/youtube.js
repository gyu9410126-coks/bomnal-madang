export default async function handler(req, res) {
  const { channelId, maxResults = 10 } = req.query;

  if (!channelId) {
    return res.status(400).json({ error: 'channelId is required' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  const url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet&order=date&type=video&videoEmbeddable=true&maxResults=${maxResults}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: 'YouTube API 호출 실패' });
  }
}

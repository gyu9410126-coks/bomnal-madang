export default async function handler(req, res) {
  const { channelId, maxResults = 10 } = req.query;

  if (!channelId) {
    return res.status(400).json({ error: 'channelId is required' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;

  // UC → UU 로 바꾸면 그 채널의 업로드 재생목록 ID가 됨
  const playlistId = channelId.replace(/^UC/, 'UU');

  const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${apiKey}&playlistId=${playlistId}&part=snippet&maxResults=${maxResults}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // playlistItems 응답을 search 응답 형식으로 변환
    // radio.html이 기대하는 형식: data.items[].id.videoId, data.items[].snippet.*
    if (data.items) {
      data.items = data.items
        .filter(function(item) {
          return item.snippet &&
                 item.snippet.resourceId &&
                 item.snippet.resourceId.videoId &&
                 item.snippet.resourceId.videoId !== 'videoseries';
        })
        .map(function(item) {
          return {
            id: { videoId: item.snippet.resourceId.videoId },
            snippet: {
              title: item.snippet.title,
              channelTitle: item.snippet.channelTitle,
              channelId: item.snippet.channelId || channelId,
              publishedAt: item.snippet.publishedAt,
              thumbnails: item.snippet.thumbnails || {}
            }
          };
        });
    }

    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: 'YouTube API 호출 실패' });
  }
}

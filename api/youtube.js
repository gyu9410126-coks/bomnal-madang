export default async function handler(req, res) {
  const { channelId, maxResults = 50 } = req.query;

  if (!channelId) {
    return res.status(400).json({ error: 'channelId is required' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;

  // PL로 시작하면 재생목록 ID, UC로 시작하면 채널 업로드 목록으로 변환
  var playlistId;
  if (channelId.startsWith('PL') || channelId.startsWith('UU')) {
    playlistId = channelId;
  } else {
    playlistId = channelId.replace(/^UC/, 'UU');
  }

  const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${apiKey}&playlistId=${playlistId}&part=snippet&maxResults=${maxResults}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.items) {
      data.items = data.items
        .filter(function(item) {
          return item.snippet &&
                 item.snippet.resourceId &&
                 item.snippet.resourceId.videoId &&
                 item.snippet.resourceId.videoId !== 'videoseries' &&
                 item.snippet.title !== 'Private video' &&
                 item.snippet.title !== 'Deleted video';
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

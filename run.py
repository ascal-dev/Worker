import requests

BASE = "https://koreanpornmovie.com/wp-json/wp/v2"

def fetch_media_with_categories(per_page=20):
    media_items = requests.get(f"{BASE}/media?per_page={per_page}").json()
    results = []

    for media in media_items:
        media_id = media['id']
        media_title = media['title']['rendered']
        media_url = media['source_url']
        media_type = media['media_type']
        post_id = media['post']

        categories = []
        post_title = None

        # Inherit categories from parent post
        if post_id:
            post = requests.get(f"{BASE}/posts/{post_id}").json()
            categories = post.get('categories', [])
            post_title = post.get('title', {}).get('rendered')

        results.append({
            "media_id": media_id,
            "media_title": media_title,
            "media_url": media_url,
            "media_type": media_type,
            "post_id": post_id,
            "post_title": post_title,
            "categories": categories
        })

    return results

# Example usage
for item in fetch_media_with_categories():
    print(item)

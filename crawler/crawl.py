from unittest import result
from mysqlx import DatabaseError
import requests
from bs4 import BeautifulSoup
from random import *
import mysql.connector
import numpy as np

def unique(arr):
    x = np.array(arr)
    return np.unique(x)

db = mysql.connector.connect(
  host="localhost",
  user="root",
  password="cjyu871998",
  database="bablamos"
)

cursor = db.cursor()

for r in range(0, 5):
    response = requests.get(f"https://dev.to/search/feed_content?per_page=100&page={r}&sort_by=hotness_score&sort_direction=desc&approved=&class_name=Article")

    paths = [ {"path": "https://dev.to" + i["path"], "tags": i["tag_list"]} for i in response.json()["result"] ]

    posts = []

    for path in paths:
        print("Crawling new post...")
        response_text = requests.get(path["path"], headers={"User-Agent": "Chrome/63.0.3239.132"}).text
        soup = BeautifulSoup(response_text, "html.parser")
        content = ""
        target = soup.select("#article-body p:first-of-type")
        if len(target) > 0:
            content = target[0].get_text()
        posts.append({
            "content": content,
            "tags": path["tags"]
            })

    all_tags = []
    for post in posts:
        for tag in post["tags"]:
            all_tags.append(tag)

    unique_tags = unique(all_tags)

    cursor.executemany("INSERT INTO tag (name) VALUES (%s) ON DUPLICATE KEY UPDATE name = name",
    [tuple([tag]) for tag in unique_tags])

    print("Tag insertion complete.")

    db.commit()

    cursor.executemany("INSERT INTO post (user_id, content, audience_type_id, shared_post_id) VALUES (%s, %s, %s, %s)",
    [tuple([randint(1, 502), post["content"], 1, None]) for post in posts])

    db.commit()

    print("Post insertion complete.")

    cursor.execute("SELECT max(id) FROM post")
    next_id = 1
    max_id_result = cursor.fetchall()
    if len(max_id_result) > 0:
        next_id = max_id_result[0][0] - 100 + 1

    post_tag_arr = []
    for i in range(0, len(posts)):
        for j in range(len(posts[i]["tags"])):
            cursor.execute("SELECT id FROM tag WHERE name = %s", tuple([posts[i]["tags"][j]]))
            result = cursor.fetchall()
            result_length = len(result)
            tag_id = None
            if result_length > 0: 
                tag_id = result[0][0]
                post_tag_arr.append(tuple([i + next_id, tag_id]))

    cursor.executemany("INSERT INTO post_tag (post_id, tag_id) VALUES (%s, %s)",
    post_tag_arr)

    db.commit()
    print("Post tag insertion complete.")

    print(f"Stage {r + 1} complete.")
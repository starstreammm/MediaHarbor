from enum import Enum


class Layer(str, Enum):
    creator = "creators"
    account = "accounts"
    post = "posts"
    collection = "collections"
    file = "files"
    queue = "queue"


class Platform(str, Enum):
    douyin = "douyin"
    bilibili = "bilibili"
    xhs = "xhs"
    ins = "ins"
    x = "x"
    youtube = "youtube"


class Status(str, Enum):
    pending = "pending"
    running = "running"
    success = "success"
    error = "error"
    paused = "paused"


class QueueJobType(str, Enum):
    """
    The job has two types, one is running instantly, the other is scheduled to run in queue.
    """

    # creator
    creator_add = "creator_add"

    # account
    account_add = "account_add"
    account_parse = "account_parse"
    account_sync = "account_sync"

    # post
    post_add = "post_add"
    post_parse = "post_parse"

    # collection
    collection_update = "collection_update"

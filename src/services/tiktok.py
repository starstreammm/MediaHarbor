from services.base import ServiceAPI
from models import Platform


class TikTokAPI(ServiceAPI):
    platform = Platform.tiktok

from services.base import ServiceAPI
from models import Platform


class DouyinAPI(ServiceAPI):
    platform = Platform.douyin

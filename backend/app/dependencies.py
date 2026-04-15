from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.security import decode_access_token
from app.services.auth_service import AuthService
from app.services.exceptions import AuthenticationError, NotFoundError

bearer_scheme = HTTPBearer(auto_error=True)

DbSession = Annotated[AsyncSession, Depends(get_db_session)]


async def get_redis_client(request: Request) -> Redis | None:
    return getattr(request.app.state, "redis", None)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    session: DbSession,
):
    try:
        payload = decode_access_token(credentials.credentials)
        service = AuthService(session)
        return await service.get_current_user(int(payload["sub"]))
    except (AuthenticationError, NotFoundError, ValueError, KeyError) as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from error

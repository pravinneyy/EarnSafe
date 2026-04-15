from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import DbSession, get_current_user
from app.models import User
from app.schemas import UserCreate, UserLogin, UserResponse, UserSessionResponse
from app.services.auth_service import AuthService
from app.services.exceptions import AuthenticationError, ConflictError, NotFoundError

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("/register", response_model=UserSessionResponse, status_code=201)
async def register_user(user: UserCreate, session: DbSession):
    try:
        return await AuthService(session).register(user)
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.post("/login", response_model=UserSessionResponse)
async def login_user(credentials: UserLogin, session: DbSession):
    try:
        return await AuthService(session).login(credentials)
    except AuthenticationError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, session: DbSession, current_user: User = Depends(get_current_user)):
    if current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        return await AuthService(session).get_current_user(user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

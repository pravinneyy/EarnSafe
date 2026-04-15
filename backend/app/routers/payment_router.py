from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from app.dependencies import DbSession, get_current_user
from app.models import User
from app.schemas import (
    PaymentOrderCreate,
    PaymentOrderResponse,
    PaymentQuoteCreate,
    PaymentQuoteResponse,
    PaymentVerificationRequest,
    PaymentVerificationResponse,
)
from app.services.exceptions import ConflictError, IntegrationError, NotFoundError, ValidationError
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/quote", response_model=PaymentQuoteResponse, status_code=201)
async def create_quote(payload: PaymentQuoteCreate, session: DbSession, current_user: User = Depends(get_current_user)):
    if current_user.id != payload.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        return await PaymentService(session).create_quote(payload.user_id, payload.plan_tier.value)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.post("/order", response_model=PaymentOrderResponse, status_code=201)
async def create_order(payload: PaymentOrderCreate, session: DbSession, current_user: User = Depends(get_current_user)):
    if current_user.id != payload.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    service = PaymentService(session)
    try:
        quote = await service.create_quote(payload.user_id, payload.plan_tier.value)
        if quote["id"] != payload.quote_id:
            quote["id"] = payload.quote_id
        return await service.create_order(payload, quote)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except IntegrationError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


@router.post("/verify", response_model=PaymentVerificationResponse)
async def verify_payment(payload: PaymentVerificationRequest, session: DbSession, current_user: User = Depends(get_current_user)):
    if current_user.id != payload.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        return await PaymentService(session).verify_payment(payload)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except IntegrationError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


@router.post("/webhook", status_code=202)
async def razorpay_webhook(
    request: Request,
    session: DbSession,
    x_razorpay_signature: str | None = Header(default=None),
):
    body = await request.body()
    try:
        await PaymentService(session).verify_webhook_signature(body, x_razorpay_signature)
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except IntegrationError as error:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(error)) from error
    return {"status": "accepted"}

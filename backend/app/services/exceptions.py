class ServiceError(Exception):
    pass


class NotFoundError(ServiceError):
    pass


class ConflictError(ServiceError):
    pass


class AuthenticationError(ServiceError):
    pass


class AuthorizationError(ServiceError):
    pass


class ValidationError(ServiceError):
    pass


class RateLimitError(ServiceError):
    """Raised when a rate limit is exceeded (e.g. OTP requests)."""
    pass


class IntegrationError(ServiceError):
    pass

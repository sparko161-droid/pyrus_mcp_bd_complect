class IikoAPIError(Exception):
    """Base exception for iiko API errors."""
    ...

class IikoAuthError(IikoAPIError):
    """Raised when authentication fails."""
    ...

class IikoRateLimitError(IikoAPIError):
    """Raised when rate limits are hit."""
    ...

class IikoSizeLimitError(IikoAPIError):
    """Raised when the response size is too large."""
    ...

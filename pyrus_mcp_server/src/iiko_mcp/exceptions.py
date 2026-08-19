class IikoAPIError(Exception):
    """Base exception for iiko API errors."""
    pass

class IikoAuthError(IikoAPIError):
    """Raised when authentication fails."""
    pass

class IikoRateLimitError(IikoAPIError):
    """Raised when rate limits are hit."""
    pass

class IikoSizeLimitError(IikoAPIError):
    """Raised when the response size is too large."""
    pass

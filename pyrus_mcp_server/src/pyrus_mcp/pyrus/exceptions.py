class PyrusAPIError(Exception):
    """Base exception for Pyrus API errors."""
    pass

class PyrusAuthError(PyrusAPIError):
    """Raised when authentication with Pyrus fails."""
    pass

class PyrusRateLimitError(PyrusAPIError):
    """Raised when the 5000/10m limit is hit or 429 is returned."""
    pass

class PyrusSizeLimitError(PyrusAPIError):
    """Raised when a response is too large to safely process."""
    pass

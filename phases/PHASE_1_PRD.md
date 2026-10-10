# LLM Interface Package - Phase 1 PRD
**Product Requirements Document**

---

## Document Info
- **Version**: 1.0
- **Date**: January 26, 2026
- **Project**: llm_interface_pkg
- **Current Version**: 0.1.4
- **Target Version**: 0.2.0

---

## 1. Executive Summary

### 1.1 Current State
The `llm_interface_pkg` library provides a working unified interface for multiple LLM providers (OpenAI, Groq, Gemini, Ollama) through LangChain. The codebase has:
- ✅ Multi-provider support with factory pattern
- ✅ Async/await support with registry caching
- ✅ Basic retry logic with exponential backoff
- ✅ Chain building capabilities
- ✅ Streaming support
- ⚠️ Print-based debugging instead of proper logging
- ⚠️ No token tracking or cost calculation
- ⚠️ Incomplete error handling
- ⚠️ Rate limiting stub (empty file)
- ⚠️ Several bugs and code quality issues

### 1.2 Phase 1 Goals
Transform the library into a **production-ready, observable, and cost-aware** LLM interface by:
1. Implementing structured logging
2. Adding token tracking and cost calculation
3. Completing rate limiting implementation
4. Fixing all critical bugs
5. Improving error handling and code quality

### 1.3 Success Metrics
- ✅ All critical bugs fixed
- ✅ 100% of LLM calls logged with structured data
- ✅ Token usage tracked for all providers
- ✅ Cost calculated per request
- ✅ Rate limiting functional for top 3 providers
- ✅ Zero print() statements in production code
- ✅ All public APIs have docstrings

---

## 2. Scope

### 2.1 In Scope for Phase 1
1. **Logging System** - Replace print() with structured logging
2. **Token Tracking** - Count tokens per request
3. **Cost Calculation** - Calculate cost based on token usage
4. **Rate Limiting** - Implement basic rate limiter for providers
5. **Bug Fixes** - Fix all critical and major bugs
6. **Error Handling** - Custom exception hierarchy
7. **Code Quality** - Remove commented code, add docstrings, fix typos
8. **Configuration** - Better timeout handling

### 2.2 Out of Scope (Defer to Phase 2)
- Advanced caching (semantic, persistent)
- Circuit breaker pattern
- Fallback providers
- Metrics collection/dashboard
- PII detection
- Batch processing
- Load balancing
- Distributed tracing

---

## 3. Critical Bug Fixes (Priority 0)

### 3.1 Code Errors
**Location**: `llm_interface/llm_client.py`

| Line | Current Code | Fix Required |
|------|--------------|--------------|
| 72 | `user_prompt_template` | Change to `user_prompt` |
| 59 | "LLM chian" | Fix typo to "chain" |
| 66 | "UsermMessagePromptTemplate" | Fix typo to "UserMessagePromptTemplate" |

**Location**: `llm_interface/model_clients/langchain_client/chatgroq.py`

| Line | Current Code | Fix Required |
|------|--------------|--------------|
| 58 | "ChatOllama" | Change to "ChatGroq" |

**Location**: `llm_interface/model_clients/langchain_client/chatopenai.py`

| Line | Current Code | Fix Required |
|------|--------------|--------------|
| 59 | "lnaggraph" | Fix typo to "langchain" |

### 3.2 Acceptance Criteria
- [ ] All typos fixed
- [ ] All undefined variables fixed
- [ ] Code runs without errors in manual testing
- [ ] Create smoke test to verify basic functionality

---

## 4. Feature Requirements

### 4.1 Structured Logging System

#### 4.1.1 Requirements
Replace all `print()` statements with Python's `logging` module using structured logging.

#### 4.1.2 Logging Levels
```python
DEBUG   - Detailed diagnostic info (cache hits, retries)
INFO    - Request/response summaries, provider switches
WARNING - Rate limit warnings, retry attempts
ERROR   - API failures, validation errors
CRITICAL- System failures
```

#### 4.1.3 Log Format
```python
{
    "timestamp": "2026-01-26T10:30:45.123Z",
    "level": "INFO",
    "module": "llm_client",
    "function": "invoke",
    "provider": "groqcloud",
    "model": "openai/gpt-oss-20b",
    "request_id": "uuid-here",
    "message": "LLM request successful",
    "metadata": {
        "tokens_prompt": 150,
        "tokens_completion": 50,
        "latency_ms": 234,
        "cost_usd": 0.0002,
        "temperature": 0.7
    }
}
```

#### 4.1.4 Implementation Tasks
- [ ] Create `llm_interface/logging/logger.py` module
- [ ] Implement `get_logger(name)` function
- [ ] Add request ID generation and propagation
- [ ] Replace all `print()` with logger calls
- [ ] Add configuration for log level via environment variable `LLM_LOG_LEVEL`
- [ ] Support both JSON and text formatters
- [ ] Add file handler option via `LLM_LOG_FILE` env var

#### 4.1.5 Code Example
```python
# Before
print(f"Initializing {self.__class__.__name__} with model: {model_name}")

# After
logger.info(
    "Initializing LLM client",
    extra={
        "provider": self.provider,
        "model": model_name,
        "temperature": temperature
    }
)
```

#### 4.1.6 Acceptance Criteria
- [ ] Zero `print()` statements in production code
- [ ] All LLM requests/responses logged at INFO level
- [ ] Errors logged with full stack traces
- [ ] Logs are JSON-formatted when `LLM_LOG_FORMAT=json`
- [ ] Log level configurable via environment variable

---

### 4.2 Token Tracking

#### 4.2.1 Requirements
Track token usage (prompt + completion) for all LLM requests.

#### 4.2.2 Token Counting Strategy
```python
# Priority order:
1. Use response metadata from provider (if available)
2. Use tiktoken for OpenAI models
3. Use character-based estimation for other providers
```

#### 4.2.3 Implementation Tasks
- [ ] Create `llm_interface/utils/token_counter.py` module
- [ ] Implement `TokenCounter` class with methods:
  - `count_tokens(text: str, model: str) -> int`
  - `estimate_tokens(text: str) -> int`
- [ ] Add `tiktoken` dependency for OpenAI models
- [ ] Create token tracking wrapper/decorator
- [ ] Store token counts in response metadata
- [ ] Log token usage with every request

#### 4.2.4 Token Counter Interface
```python
class TokenCounter:
    @staticmethod
    def count_tokens(
        text: str,
        model: str,
        provider: str
    ) -> int:
        """Count tokens using provider-specific method"""
        
    @staticmethod
    def count_messages_tokens(
        messages: List[dict],
        model: str,
        provider: str
    ) -> int:
        """Count tokens in message list"""
```

#### 4.2.5 Response Enhancement
Enhance all client responses to include token metadata:
```python
{
    "content": "...",
    "metadata": {
        "tokens_prompt": 150,
        "tokens_completion": 50,
        "tokens_total": 200,
        "model": "gpt-4",
        "provider": "openai"
    }
}
```

#### 4.2.6 Acceptance Criteria
- [ ] Token counts accurate for OpenAI models (using tiktoken)
- [ ] Token estimation available for all providers
- [ ] Token data included in response metadata
- [ ] Token counts logged with every request
- [ ] Handles messages with images appropriately

---

### 4.3 Cost Calculation

#### 4.3.1 Requirements
Calculate cost in USD for every LLM request based on token usage and provider pricing.

#### 4.3.2 Pricing Data
Create pricing configuration for all supported providers:

```python
# llm_interface/constants/pricing.py
PRICING = {
    "openai": {
        "gpt-4": {
            "prompt": 0.03 / 1000,      # per token
            "completion": 0.06 / 1000
        },
        "gpt-3.5-turbo": {
            "prompt": 0.0015 / 1000,
            "completion": 0.002 / 1000
        }
    },
    "groqcloud": {
        "default": {  # Groq is currently free
            "prompt": 0.0,
            "completion": 0.0
        }
    },
    "gemini": {
        "gemini-pro": {
            "prompt": 0.00025 / 1000,
            "completion": 0.0005 / 1000
        }
    }
}
```

#### 4.3.3 Implementation Tasks
- [ ] Create `llm_interface/constants/pricing.py` with pricing data
- [ ] Create `llm_interface/utils/cost_calculator.py` module
- [ ] Implement `CostCalculator` class with methods:
  - `calculate_cost(tokens_prompt, tokens_completion, model, provider) -> float`
  - `get_pricing(model, provider) -> dict`
- [ ] Add cost calculation to all client invoke methods
- [ ] Include cost in response metadata
- [ ] Log cost with every request

#### 4.3.4 Cost Calculator Interface
```python
class CostCalculator:
    @staticmethod
    def calculate_cost(
        tokens_prompt: int,
        tokens_completion: int,
        model: str,
        provider: str
    ) -> float:
        """Calculate cost in USD"""
        
    @staticmethod
    def get_pricing(model: str, provider: str) -> dict:
        """Get pricing info for model"""
```

#### 4.3.5 Response Enhancement
```python
{
    "content": "...",
    "metadata": {
        "tokens_prompt": 150,
        "tokens_completion": 50,
        "tokens_total": 200,
        "cost_usd": 0.0045,
        "cost_breakdown": {
            "prompt_cost": 0.0045,
            "completion_cost": 0.003
        }
    }
}
```

#### 4.3.6 Acceptance Criteria
- [ ] Cost calculated for all providers
- [ ] Accurate cost for OpenAI models
- [ ] Pricing data easily updateable
- [ ] Cost included in response metadata
- [ ] Cost logged with every request
- [ ] Handles free providers (cost = 0)

---

### 4.4 Rate Limiting

#### 4.4.1 Requirements
Implement token bucket rate limiting to prevent exceeding provider limits.

#### 4.4.2 Provider Limits (Default)
```python
RATE_LIMITS = {
    "openai": {
        "requests_per_minute": 3500,
        "tokens_per_minute": 90000
    },
    "groqcloud": {
        "requests_per_minute": 30,
        "tokens_per_minute": 6000
    },
    "gemini": {
        "requests_per_minute": 60,
        "tokens_per_minute": 32000
    },
    "self-managed": {  # Ollama - no limits
        "requests_per_minute": None,
        "tokens_per_minute": None
    }
}
```

#### 4.4.3 Implementation Tasks
- [ ] Implement `llm_interface/utils/rate_limiter.py` (currently empty)
- [ ] Create `RateLimiter` class using token bucket algorithm
- [ ] Support per-provider configuration
- [ ] Add configurable rate limits via `LLMModelConfig`
- [ ] Integrate with retry logic (wait when rate limited)
- [ ] Add rate limit status to logs

#### 4.4.4 RateLimiter Interface
```python
class RateLimiter:
    def __init__(
        self,
        requests_per_minute: int,
        tokens_per_minute: int,
        provider: str
    ):
        """Initialize token bucket rate limiter"""
    
    async def acquire(
        self,
        tokens: int = 1
    ) -> float:
        """
        Acquire tokens from bucket.
        Returns: wait time in seconds (0 if immediate)
        """
    
    def get_status(self) -> dict:
        """Get current rate limit status"""
```

#### 4.4.5 Integration Points
- [ ] Add to `LangchainLLMClientMixin.__init__`
- [ ] Call `rate_limiter.acquire()` before each request
- [ ] Log when rate limited
- [ ] Include in retry logic

#### 4.4.6 Configuration Enhancement
Update `LLMModelConfig`:
```python
class LLMModelConfig(BaseModel):
    # ... existing fields ...
    rate_limit_requests_per_minute: Optional[int] = None
    rate_limit_tokens_per_minute: Optional[int] = None
```

#### 4.4.7 Acceptance Criteria
- [ ] Rate limiting works for OpenAI, Groq, Gemini
- [ ] Does not rate limit Ollama (self-managed)
- [ ] Respects both request and token limits
- [ ] Logs when rate limited
- [ ] Configurable per provider
- [ ] Thread-safe implementation

---

### 4.5 Error Handling

#### 4.5.1 Requirements
Create custom exception hierarchy for better error handling.

#### 4.5.2 Exception Hierarchy
```python
# llm_interface/exceptions.py
class LLMInterfaceError(Exception):
    """Base exception for all library errors"""

class ConfigurationError(LLMInterfaceError):
    """Invalid configuration"""

class ProviderError(LLMInterfaceError):
    """Provider-specific errors"""
    
class APIError(ProviderError):
    """API call failed"""
    
class RateLimitError(ProviderError):
    """Rate limit exceeded"""
    
class AuthenticationError(ProviderError):
    """API key invalid or missing"""
    
class ModelNotFoundError(ProviderError):
    """Model not available"""
    
class TokenLimitError(LLMInterfaceError):
    """Token limit exceeded"""
    
class ParsingError(LLMInterfaceError):
    """Output parsing failed"""
```

#### 4.5.3 Implementation Tasks
- [ ] Create `llm_interface/exceptions.py`
- [ ] Replace generic exceptions with specific ones
- [ ] Add error codes to exceptions
- [ ] Improve error messages with actionable info
- [ ] Log exceptions with full context

#### 4.5.4 Exception Enhancement
```python
class ProviderError(LLMInterfaceError):
    def __init__(
        self,
        message: str,
        provider: str,
        model: str = None,
        original_error: Exception = None
    ):
        self.provider = provider
        self.model = model
        self.original_error = original_error
        super().__init__(message)
```

#### 4.5.5 Usage Example
```python
# Before
if not api_key:
    raise Exception("API key not found")

# After
if not api_key:
    raise AuthenticationError(
        f"API key for {provider} not found. "
        f"Set environment variable: {api_key_env}",
        provider=provider
    )
```

#### 4.5.6 Acceptance Criteria
- [ ] All custom exceptions defined
- [ ] Exceptions include provider/model context
- [ ] Error messages are actionable
- [ ] Original errors preserved in chain
- [ ] All exceptions properly logged

---

### 4.6 Timeout Handling

#### 4.6.1 Requirements
Add configurable timeouts for all LLM requests.

#### 4.6.2 Configuration Enhancement
Update `LLMModelConfig`:
```python
class LLMModelConfig(BaseModel):
    # ... existing fields ...
    request_timeout: float = 60.0  # seconds
    connect_timeout: float = 10.0  # seconds
```

#### 4.6.3 Implementation Tasks
- [ ] Add timeout parameters to `LLMModelConfig`
- [ ] Pass timeouts to LangChain clients
- [ ] Add timeout handling in retry logic
- [ ] Log timeout events

#### 4.6.4 Acceptance Criteria
- [ ] Timeouts configurable per request
- [ ] Default timeout of 60s
- [ ] Timeout errors properly handled and logged
- [ ] Works with retry logic

---

### 4.7 Code Quality Improvements

#### 4.7.1 Requirements
Clean up codebase and improve maintainability.

#### 4.7.2 Tasks
- [ ] Remove all commented-out code
- [ ] Add docstrings to all public functions/classes
- [ ] Use consistent None checking (`is None` instead of `== None`)
- [ ] Fix all typos in comments and strings
- [ ] Add type hints where missing
- [ ] Format code with `black`
- [ ] Run `pylint` and fix issues

#### 4.7.3 Docstring Format
```python
def get_llm_client(llm_config: LLMModelConfig, **kwargs) -> LLMClient:
    """
    Get a configured LLM client for the specified provider.
    
    Args:
        llm_config: Configuration for the LLM model
        **kwargs: Additional arguments passed to the client
        
    Returns:
        Configured LLM client instance
        
    Raises:
        ConfigurationError: If configuration is invalid
        ProviderError: If provider initialization fails
        
    Example:
        >>> config = LLMModelConfig(
        ...     model_provider="groqcloud",
        ...     model_name="llama-3.1-8b"
        ... )
        >>> client = get_llm_client(config)
    """
```

#### 4.7.4 Acceptance Criteria
- [ ] No commented-out code in production files
- [ ] All public APIs have docstrings
- [ ] Code formatted with `black`
- [ ] Pylint score > 8.0
- [ ] Type hints on all function signatures

---

## 5. Configuration Changes

### 5.1 Enhanced LLMModelConfig
```python
class LLMModelConfig(BaseModel):
    # Existing fields
    model_provider: Constants.ModelProvider = "groqcloud"
    model_name: str
    model_interface_framework_type: Literal["langchain", "openai"] = "langchain"
    model_provider_base_url: str = ""
    temperature: float = 0.7
    streaming: bool = False
    tool_calling: bool = False
    tools: Optional[list] = None
    
    # NEW: Phase 1 additions
    request_timeout: float = 60.0
    connect_timeout: float = 10.0
    rate_limit_requests_per_minute: Optional[int] = None
    rate_limit_tokens_per_minute: Optional[int] = None
    enable_token_tracking: bool = True
    enable_cost_calculation: bool = True
    log_level: Optional[str] = None  # Override global log level
```

### 5.2 Environment Variables
```bash
# Existing
OPENAI_CLOUD_PROVIDE_API_KEY
GROQ_CLOUD_PROVIDER_API_KEY
GOOGLE_API_KEY

# NEW: Phase 1 additions
LLM_LOG_LEVEL=INFO              # DEBUG, INFO, WARNING, ERROR, CRITICAL
LLM_LOG_FORMAT=json             # json or text
LLM_LOG_FILE=/path/to/log.txt   # Optional file logging
```

---

## 6. New Dependencies

Add to `pyproject.toml`:
```toml
dependencies = [
    # Existing dependencies...
    "tiktoken>=0.5.1",    # Token counting for OpenAI models
]
```

---

## 7. File Structure Changes

### 7.1 New Files
```
llm_interface/
├── exceptions.py              # NEW: Custom exception hierarchy
├── logging/
│   ├── __init__.py           # NEW
│   └── logger.py             # NEW: Structured logging
├── constants/
│   └── pricing.py            # NEW: Provider pricing data
├── utils/
│   ├── token_counter.py      # NEW: Token counting
│   ├── cost_calculator.py    # NEW: Cost calculation
│   └── rate_limiter.py       # COMPLETE: Currently empty
```

### 7.2 Modified Files
```
llm_interface/
├── llm_client.py             # Fix bugs, add logging, token tracking
├── llm_registry.py           # Add logging
├── data_models.py            # Add new config fields
├── model_clients/
│   └── langchain_client/
│       ├── base.py           # Add rate limiting, token tracking
│       ├── chatopenai.py     # Fix bugs, add logging
│       ├── chatgroq.py       # Fix bugs, add logging
│       ├── chatgemini.py     # Add logging
│       └── chatollama.py     # Add logging
└── utils/
    ├── retry.py              # Add logging
    └── streaming.py          # Add logging
```

---

## 8. Testing Requirements

### 8.1 Manual Testing Checklist
- [ ] Test each provider (OpenAI, Groq, Gemini, Ollama)
- [ ] Test token tracking accuracy
- [ ] Test cost calculation
- [ ] Test rate limiting (trigger limit)
- [ ] Test retry logic
- [ ] Test timeout handling
- [ ] Test error handling
- [ ] Test logging output (JSON and text)
- [ ] Test streaming
- [ ] Test tool calling

### 8.2 Test Script Requirements
Create `tests/test_phase1.py`:
- [ ] Test token counting for sample prompts
- [ ] Test cost calculation with known inputs
- [ ] Test rate limiter behavior
- [ ] Test exception handling
- [ ] Test logging configuration

---

## 9. Documentation Requirements

### 9.1 Update README.md
- [ ] Installation instructions
- [ ] Quick start guide
- [ ] Configuration examples
- [ ] Environment variables
- [ ] Provider setup guides
- [ ] Token tracking usage
- [ ] Cost tracking usage
- [ ] Rate limiting configuration
- [ ] Logging configuration
- [ ] Error handling examples

### 9.2 Code Examples
Create `examples/` directory:
- [ ] `basic_usage.py`
- [ ] `async_usage.py`
- [ ] `token_tracking.py`
- [ ] `cost_tracking.py`
- [ ] `rate_limiting.py`
- [ ] `error_handling.py`
- [ ] `custom_logging.py`

---

## 10. Deliverables

### 10.1 Code
- [ ] All bugs fixed
- [ ] Logging system implemented
- [ ] Token tracking implemented
- [ ] Cost calculation implemented
- [ ] Rate limiting implemented
- [ ] Error handling improved
- [ ] Code quality improvements complete
- [ ] All tests passing

### 10.2 Documentation
- [ ] README.md complete
- [ ] All public APIs documented
- [ ] Example scripts created
- [ ] Migration guide (0.1.4 → 0.2.0)

### 10.3 Release
- [ ] Version bumped to 0.2.0
- [ ] CHANGELOG.md created
- [ ] Tagged release in git
- [ ] Published to PyPI

---

## 11. Implementation Priority

### Priority 0: Critical Fixes (1-2 days)
1. Fix all typos and undefined variables
2. Test current functionality
3. Create smoke test

### Priority 1: Core Features (1 week)
1. Implement logging system
2. Implement token tracking
3. Implement cost calculation
4. Add custom exceptions

### Priority 2: Reliability (1 week)
1. Implement rate limiting
2. Add timeout handling
3. Improve retry logic integration
4. Add comprehensive error handling

### Priority 3: Polish (3-5 days)
1. Code quality improvements
2. Documentation
3. Examples
4. Testing

**Total Estimated Time: 3-4 weeks**

---

## 12. Success Criteria

Phase 1 is complete when:

✅ **Functionality**
- All critical bugs fixed
- Logging system fully implemented
- Token tracking working for all providers
- Cost calculation accurate
- Rate limiting functional

✅ **Code Quality**
- No print() statements
- All public APIs have docstrings
- Pylint score > 8.0
- No commented-out code

✅ **Documentation**
- README.md complete
- All examples working
- Migration guide available

✅ **Testing**
- Manual test checklist complete
- Smoke tests passing
- All providers tested

---

## 13. Out of Scope (Phase 2+)

Features explicitly **NOT** included in Phase 1:
- Advanced caching (semantic, persistent storage)
- Circuit breaker pattern
- Automatic fallback to alternate providers
- Metrics dashboard or visualization
- PII detection and masking
- Batch request processing
- Load balancing across API keys
- Distributed tracing
- Response quality scoring
- A/B testing framework
- Prompt versioning system

---

## 14. Open Questions

1. **Token Counting**: Should we support custom token counters for proprietary models?
2. **Rate Limiting**: Should rate limits be per API key or per client instance?
3. **Cost Tracking**: Should we maintain cumulative cost tracking across sessions?
4. **Logging**: Should we support external logging services (Datadog, CloudWatch)?
5. **Configuration**: Should pricing data be user-overridable?

---

## 15. Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Provider API changes | High | Medium | Version pin dependencies, test before upgrade |
| Pricing changes | Medium | High | Make pricing easily configurable, document update process |
| Token counting inaccuracy | Medium | Medium | Use official libraries where available, document limitations |
| Performance overhead from logging | Low | Low | Make logging configurable, use async where possible |
| Rate limit edge cases | Medium | Low | Conservative defaults, good error messages |

---

## Appendix A: Code Examples

### Example 1: Basic Usage with Token Tracking
```python
from llm_interface.llm_client import get_llm_client
from llm_interface.data_models import LLMModelConfig

config = LLMModelConfig(
    model_provider="openai",
    model_name="gpt-4",
    temperature=0.7,
    enable_token_tracking=True,
    enable_cost_calculation=True
)

client = get_llm_client(config)
response = client.llm_client.invoke("What is Python?")

# Access metadata
print(f"Tokens used: {response.metadata['tokens_total']}")
print(f"Cost: ${response.metadata['cost_usd']:.4f}")
```

### Example 2: Rate Limiting
```python
config = LLMModelConfig(
    model_provider="groqcloud",
    model_name="llama-3.1-8b",
    rate_limit_requests_per_minute=20,  # Custom limit
    rate_limit_tokens_per_minute=5000
)

client = get_llm_client(config)

# Client will automatically rate limit requests
for i in range(100):
    response = client.llm_client.invoke(f"Request {i}")
    # Automatically waits if rate limit reached
```

### Example 3: Custom Logging
```python
import os
os.environ['LLM_LOG_LEVEL'] = 'DEBUG'
os.environ['LLM_LOG_FORMAT'] = 'json'
os.environ['LLM_LOG_FILE'] = 'llm_calls.log'

# All subsequent calls will use these settings
client = get_llm_client(config)
```

---

## Appendix B: Migration Guide (0.1.4 → 0.2.0)

### Breaking Changes
None - Phase 1 is backward compatible

### New Optional Features
```python
# Old way (still works)
config = LLMModelConfig(
    model_provider="groqcloud",
    model_name="llama-3.1-8b"
)

# New way (with Phase 1 features)
config = LLMModelConfig(
    model_provider="groqcloud",
    model_name="llama-3.1-8b",
    request_timeout=30.0,                      # NEW
    rate_limit_requests_per_minute=50,         # NEW
    enable_token_tracking=True,                # NEW (default)
    enable_cost_calculation=True               # NEW (default)
)
```

### Deprecation Warnings
None

---

**End of PRD**

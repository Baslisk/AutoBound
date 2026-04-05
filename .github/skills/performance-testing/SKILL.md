---
name: performance-testing
description: "Run, analyze, and improve performance benchmarks for frame seeking, caching, and API latency in the AutoBound desktop and web apps. Use when: slow frame scrolling, latency regression, run perf tests, benchmark frames, cache tuning, frame seek performance, optimize annotator speed."
---

# Performance Testing

## When to Use
- Running performance benchmarks (frame seek, cache hit/miss, API latency, desktop pipeline)
- Diagnosing slow frame scrolling in the web or desktop annotator
- Tuning FrameCache parameters (max_frames, max_captures)
- Verifying a change doesn't regress frame-serving latency
- Adding new performance benchmarks

## Test Infrastructure

### Files
```
frame_cache.py                          — LRU frame cache (shared by desktop + web)
tests/perf/helpers.py                   — make_test_video(), TimingResult, benchmark()
tests/perf/test_frame_seek.py           — Raw cv2 + FrameCache benchmarks
tests/perf/test_desktop_frame_display.py — Full desktop pipeline benchmarks
tests/perf/test_web_frame_api.py        — Django /api/frame/ endpoint benchmarks
web/annotations/api.py                  — Server-side FrameCache integration
web/static/js/annotator.js              — Client-side LRU cache + prefetch + debounce
```

### Key Classes
- `FrameCache(max_frames=N, max_captures=M)` — Thread-safe LRU cache for decoded frames
  - `get_frame(path, frame_number)` → BGR numpy array (or None)
  - `get_frame_jpeg(path, frame_number)` → JPEG bytes (or None)
  - `prefetch(path, frame_numbers)` → background thread loads frames
  - `evict_video(path)` → remove all cached frames for a video
  - `stats` property → dict with hits, misses, hit_rate
- `TimingResult` — Stats container with min, median, p95, max
- `benchmark(func, iterations, warmup)` → TimingResult
- `timer_ms()` → context manager yielding elapsed milliseconds

## Running Benchmarks

### All tests (full suite)
```bash
python run_test_suite.py
```

### Perf tests only (non-Django)
```bash
python -m pytest tests/perf/test_frame_seek.py tests/perf/test_desktop_frame_display.py -v
```

### Django API perf tests
```bash
cd web && python manage.py test tests.perf.test_web_frame_api --verbosity=2
```
Or from project root:
```bash
DJANGO_SETTINGS_MODULE=autobound_web.settings PYTHONPATH=.:web python -m django test tests.perf.test_web_frame_api --verbosity=2
```

### Override thresholds via environment
```bash
PERF_SEQ_P95_MS=80 PERF_RAND_P95_MS=150 python -m pytest tests/perf/test_frame_seek.py -v
PERF_API_P95_MS=200 python -m django test tests.perf.test_web_frame_api -v
```

## Default Performance Thresholds

| Metric                     | p95 Threshold | Env Var              |
|----------------------------|--------------|----------------------|
| Sequential seek (raw cv2)  | 100 ms       | PERF_SEQ_P95_MS      |
| Random seek (raw cv2)      | 200 ms       | PERF_RAND_P95_MS     |
| Cache miss (FrameCache)    | 200 ms       | PERF_RAND_P95_MS     |
| Cache hit (FrameCache)     | 5 ms         | —                    |
| Desktop pipeline (cached)  | 50 ms        | —                    |
| Desktop pipeline (uncached)| 150 ms       | —                    |
| Web API p95                | 300 ms       | PERF_API_P95_MS      |

## Caching Architecture

### Server-side (api.py)
- Module-level `_frame_cache = FrameCache(max_frames=64, max_captures=8)`
- `get_frame()` view uses `_frame_cache.get_frame_jpeg()` instead of raw cv2
- Prefetches ±3 adjacent frames in background thread on each request

### Client-side (annotator.js)
- JavaScript `Map` as LRU cache: frame_number → decoded Image object
- Max 32 entries; oldest evicted on overflow
- `goToFrame()` checks cache before fetching from server
- Prefetches ±3 adjacent frames after each navigation
- Slider input debounced at 100ms to avoid flooding requests

## Adding a New Benchmark

1. Create a test method in the appropriate `tests/perf/test_*.py` file
2. Use `benchmark(func, iterations=N, warmup=W)` from `tests.perf.helpers`
3. Print the `TimingResult` for visibility in CI output
4. Add `assertLessEqual(result.p95, threshold)` with a configurable env var
5. Update the thresholds table above

## Tuning FrameCache

Key parameters to experiment with:
- `max_frames` — number of decoded frames kept in memory (default: 32 desktop, 64 server)
- `max_captures` — pool of open cv2.VideoCapture handles (default: 4 desktop, 8 server)
- Prefetch window — currently ±3 frames (both server and client)
- Client cache size — `frameCacheMax` in annotator.js (default: 32)
- Slider debounce — delay in ms before fetching on slider drag (default: 100ms)

Trade-offs:
- Larger `max_frames` → more RAM but better hit rate
- More `max_captures` → faster concurrent access but more file handles
- Wider prefetch → smoother sequential browsing but wasted bandwidth on random jumps

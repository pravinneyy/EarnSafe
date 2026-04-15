from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "earnsafe",
    broker=settings.effective_celery_broker_url,
    backend=settings.effective_celery_result_backend,
)

celery_app.conf.task_default_queue = "earnsafe"
celery_app.conf.beat_schedule = {
    "poll-weather-every-5-minutes": {
        "task": "app.workers.tasks.poll_weather",
        "schedule": 300.0,
    },
    "evaluate-triggers-every-minute": {
        "task": "app.workers.tasks.evaluate_triggers",
        "schedule": 60.0,
    },
    "auto-process-claims-every-2-minutes": {
        "task": "app.workers.tasks.auto_process_claims",
        "schedule": 120.0,
    },
}

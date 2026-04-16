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
    # Step 1: Poll weather APIs → create TriggerEvents for active users
    "poll-weather-every-5-minutes": {
        "task": "app.workers.tasks.poll_weather",
        "schedule": 300.0,
    },
    # Step 2: Run TriggerEngine → TriggerEvent → Claim → Wallet credit
    "process-triggers-every-minute": {
        "task": "app.workers.tasks.process_triggers",
        "schedule": 60.0,
    },
}

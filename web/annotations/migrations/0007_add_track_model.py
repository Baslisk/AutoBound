import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("annotations", "0006_add_track_id"),
    ]

    operations = [
        # 1. Create Track table
        migrations.CreateModel(
            name="Track",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                ("color", models.CharField(default="#3b82f6", max_length=7)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "category",
                    models.ForeignKey(
                        default=1,
                        on_delete=django.db.models.deletion.SET_DEFAULT,
                        related_name="tracks",
                        to="annotations.category",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="tracks",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "video",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="tracks",
                        to="annotations.videofile",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
            },
        ),
        # 2. Remove old integer track_id field
        migrations.RemoveField(
            model_name="annotation",
            name="track_id",
        ),
        # 3. Add new FK track field (creates track_id column)
        migrations.AddField(
            model_name="annotation",
            name="track",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="annotations",
                to="annotations.track",
            ),
        ),
        # 4. Add unique constraint
        migrations.AddConstraint(
            model_name="annotation",
            constraint=models.UniqueConstraint(
                condition=models.Q(("track__isnull", False)),
                fields=("image", "frame_number", "track"),
                name="unique_track_frame",
            ),
        ),
    ]

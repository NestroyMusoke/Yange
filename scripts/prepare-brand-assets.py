from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps" / "web" / "public"
ICON_NAMES = ("today", "studio", "wearcast", "atelier", "cloud", "judge")


def alpha_trim(image: Image.Image, padding_ratio: float = 0.06) -> Image.Image:
    image = image.convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Asset has no visible pixels.")
    left, top, right, bottom = bbox
    padding = round(max(right - left, bottom - top) * padding_ratio)
    return image.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    ))


def square_asset(image: Image.Image, size: int = 256) -> Image.Image:
    trimmed = alpha_trim(image)
    usable = round(size * 0.88)
    scale = min(usable / trimmed.width, usable / trimmed.height)
    resized = trimmed.resize(
        (max(1, round(trimmed.width * scale)), max(1, round(trimmed.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def prepare_navigation_icons() -> None:
    sprite_path = PUBLIC / "icons" / "yange-navigation-sprite.png"
    sprite = Image.open(sprite_path).convert("RGBA")
    cell_width = sprite.width // 3
    cell_height = sprite.height // 2
    for index, name in enumerate(ICON_NAMES):
        column = index % 3
        row = index // 3
        cell = sprite.crop((
            column * cell_width,
            row * cell_height,
            (column + 1) * cell_width if column < 2 else sprite.width,
            (row + 1) * cell_height if row < 1 else sprite.height,
        ))
        square_asset(cell).save(PUBLIC / "icons" / f"nav-{name}.png", optimize=True)


def prepare_logo() -> None:
    lockup_path = PUBLIC / "brand" / "yange-official-lockup.png"
    lockup = Image.open(lockup_path).convert("RGBA")
    trimmed_lockup = alpha_trim(lockup, 0.035)
    if trimmed_lockup.width > 1200:
        target_height = round(trimmed_lockup.height * 1200 / trimmed_lockup.width)
        trimmed_lockup = trimmed_lockup.resize((1200, target_height), Image.Resampling.LANCZOS)
    trimmed_lockup.save(lockup_path, optimize=True)

    emblem_region = lockup.crop((0, 0, lockup.width, round(lockup.height * 0.56)))
    square_asset(emblem_region, 512).save(PUBLIC / "brand" / "yange-emblem.png", optimize=True)
    square_asset(emblem_region, 192).save(PUBLIC / "brand" / "yange-app-icon.png", optimize=True)


if __name__ == "__main__":
    prepare_navigation_icons()
    prepare_logo()

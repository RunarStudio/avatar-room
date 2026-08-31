/**
 * Avatar physics and rendering — ported from overlay.py Avatar class.
 * Handles gravity, walking, animation state, and canvas drawing.
 */

// Physics constants
const GRAVITY = 0.55;
const WALK_SPEED = 1.8;
const WALL_CLIMB_SPEED = 1.4;
const WALL_CLIMB_CHANCE = 0.4;

// Render height for every sprite frame; native aspect ratio sets the width.
const SPRITE_H = 44;

export enum Status {
  IDLE = "idle",
  THINKING = "thinking",
  BUSY = "busy",
  SUBAGENT = "subagent",
  ERROR = "error",
  DONE = "done",
  NEEDS_INPUT = "needs_input",
}

const STATUS_COLOR: Record<Status, string> = {
  [Status.IDLE]: "#44ff88",
  [Status.THINKING]: "#ffdd44",
  [Status.BUSY]: "#ff8844",
  [Status.SUBAGENT]: "#aa44ff",
  [Status.ERROR]: "#ff4444",
  [Status.DONE]: "#44aaff",
  [Status.NEEDS_INPUT]: "#ff44dd",
};

export type Program = "claude" | "cursor";

// Mirrors ANIM_ROW in sprite_loader.py: idle=row0, busy=row1(run), thinking=
// row2(sit), done/error/needs_input=row3(stand). Cursor is a Stage-1 stub
// (session_scanner.CursorScanner always returns []) so it only ever shows
// idle — no run/sit/stand frames exist for it.
const SPRITE_FRAME: Record<Program, Partial<Record<Status, string>>> = {
  claude: {
    [Status.IDLE]: "caine-idle.png",
    [Status.BUSY]: "caine-run.png",
    [Status.THINKING]: "caine-sit.png",
    [Status.DONE]: "caine-stand.png",
    [Status.ERROR]: "caine-stand.png",
    [Status.NEEDS_INPUT]: "caine-stand.png",
  },
  cursor: {
    [Status.IDLE]: "bubble-idle.png",
  },
};

// Native width per frame at SPRITE_H render height (feet flush with the
// image's bottom edge — frames were cropped to content at extraction).
const SPRITE_W: Record<string, number> = {
  "caine-idle.png": 29,
  "caine-run.png": 28,
  "caine-sit.png": 28,
  "caine-stand.png": 30,
  "bubble-idle.png": 44,
};

const SPRITE_BASE = "/sprites/";
const imageCache = new Map<string, HTMLImageElement>();

function loadSprite(filename: string): HTMLImageElement {
  let img = imageCache.get(filename);
  if (!img) {
    img = new Image();
    img.src = SPRITE_BASE + filename;
    imageCache.set(filename, img);
  }
  return img;
}

function spriteFrame(program: Program, status: Status): string {
  const byStatus = SPRITE_FRAME[program];
  return byStatus[status] ?? byStatus[Status.IDLE]!;
}

export interface AvatarState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  status: Status;
  onWall: boolean;
  frame: number;
}

export class Avatar {
  state: AvatarState;
  canvas: HTMLCanvasElement;
  screenWidth: number;
  screenHeight: number;
  program: Program;

  constructor(
    canvas: HTMLCanvasElement,
    initialX: number,
    initialY: number,
    program: Program,
    initialStatus: Status = Status.IDLE
  ) {
    this.canvas = canvas;
    this.screenWidth = canvas.width;
    this.screenHeight = canvas.height;
    this.program = program;

    // Pre-warm every reachable frame for this program so the first status
    // change doesn't stall on a network fetch.
    Object.values(SPRITE_FRAME[program]).forEach((f) => loadSprite(f as string));

    this.state = {
      x: initialX,
      y: initialY,
      vx: 0,
      vy: 0,
      width: 32,
      height: 32,
      status: initialStatus,
      onWall: false,
      frame: 0,
    };
  }

  /**
   * Update physics for one frame.
   * - Apply gravity
   * - Handle wall collisions
   * - Move based on velocity
   * - Update animation frame
   */
  update() {
    const { x, y, vx, vy, width, height, status, onWall } = this.state;

    // If needs input, stop movement and play stand animation
    if (status === Status.NEEDS_INPUT) {
      this.state.vx = 0;
      this.state.vy = 0;
      // Stand row will play in draw()
      this.state.frame = (this.state.frame + 1) % 4; // Cycle through stand frames
      return;
    }

    // Apply gravity (only if not on wall)
    let newVy = vy;
    if (!onWall) {
      newVy += GRAVITY;
    } else {
      newVy = 0; // Stop falling if on wall
    }

    // Horizontal movement: random walk
    let newVx = vx;
    if (Math.random() < 0.02) {
      newVx = (Math.random() - 0.5) * WALK_SPEED * 2;
    }

    // Try to climb walls if falling
    if (newVy > 0.5 && !onWall && Math.random() < WALL_CLIMB_CHANCE) {
      // Attempt wall climb
      const hitWall = this.checkWallCollision(x, y - height / 2);
      if (hitWall) {
        this.state.onWall = true;
        newVy = -WALL_CLIMB_SPEED;
      }
    }

    // Bounce off bottom
    let newY = y + newVy;
    if (newY + height > this.screenHeight) {
      newY = this.screenHeight - height;
      newVy = -Math.abs(newVy) * 0.6; // Bounce
      this.state.onWall = false;
    }

    // Bounce off sides
    let newX = x + newVx;
    if (newX < 0) {
      newX = 0;
      newVx = Math.abs(newVx);
    }
    if (newX + width > this.screenWidth) {
      newX = this.screenWidth - width;
      newVx = -Math.abs(newVx);
    }

    // Check if still on wall
    if (this.state.onWall) {
      const stillOnWall = this.checkWallCollision(newX, newY);
      if (!stillOnWall && newVy >= 0) {
        this.state.onWall = false;
      }
    }

    // Update state
    this.state.x = newX;
    this.state.y = newY;
    this.state.vx = newVx;
    this.state.vy = newVy;
    this.state.frame = (this.state.frame + 1) % 60; // Cycle animation frame
  }

  /**
   * Simple wall collision check (placeholder for screen edges).
   * Phase 1: simplified — just screen edges, no window terrain.
   */
  checkWallCollision(x: number, y: number): boolean {
    // Check if position is near top of screen (climbable wall)
    return y < 50;
  }

  /**
   * Draw the avatar on the canvas.
   */
  draw(ctx: CanvasRenderingContext2D) {
    const { x, y, width, status, frame } = this.state;
    const color = STATUS_COLOR[status] || STATUS_COLOR[Status.IDLE];

    const frameFile = spriteFrame(this.program, status);
    const img = loadSprite(frameFile);
    const spriteW = SPRITE_W[frameFile];
    // Feet sit on the same ground line the old placeholder rectangle used
    // (y + height), keeping physics untouched while only the art changes.
    const groundY = y + this.state.height;
    const drawX = x + width / 2 - spriteW / 2;
    const drawY = groundY - SPRITE_H;

    // Status glow behind the sprite — this is the visual cue now that the
    // sprite itself doesn't tint per status the way the old rectangle did.
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.ellipse(x + width / 2, groundY - 4, spriteW * 0.75, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    if (img.complete && img.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, drawX, drawY, spriteW, SPRITE_H);
    }

    // NEEDS_INPUT blink marker
    if (status === Status.NEEDS_INPUT && Math.floor(frame / 4) % 2 === 0) {
      ctx.fillStyle = "#ff44dd";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", x + width / 2, drawY - 8);
    }
  }

  /**
   * Update status and reset animation frame.
   */
  setStatus(newStatus: Status) {
    this.state.status = newStatus;
    this.state.frame = 0;
  }
}

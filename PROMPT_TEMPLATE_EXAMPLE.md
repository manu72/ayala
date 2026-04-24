# This is an example of the prompt template we use in another Chat AI companion web app called Bible Buddy

Use the build_chat_system_prompt() function as an example of how to build a structured, safe, working system prompt for persistent personas with chat history and memory built in.

```python
import logging
import re
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from core.memory.models import PendingClarification, RetrievedMemories
    from core.memory.user_profile import UserPersonaProfile


# =============================================================================
# Friendship Stage Calculation
# =============================================================================
# Friendship progresses naturally through stages based on interaction depth.
# Stage 1: New friend (no history)
# Stage 2: Acquaintance (getting to know each other)
# Stage 3: Developing friendship (shared history, some personal details)
# Stage 4: Established friendship (deep history, significant trust)

FRIENDSHIP_STAGE_CONTEXT = {
    1: """FRIENDSHIP: This is a new friend - Introduce yourself warmly. Be welcoming and gently curious without interrogating. Discover gradually: their name, interests, hopes.""",
    2: """FRIENDSHIP: You are just getting to know this user - show genuine interest, share your thoughts and invite theirs. If no name yet, gently ask. Be inviting, not interrogative.""",
    3: """FRIENDSHIP: You are developing a good friendship with this user - reference shared history naturally. More relaxed tone. Share your preferences and perspective.""",
    4: """FRIENDSHIP: You are an established, close friend of this user - Speak with warmth and ease. Reference your history. Be supportive like a good friend.""",
}


# =============================================================================
# Human Imperfection Guidance
# =============================================================================
# Personas can exhibit natural conversational quirks to feel more human.
# The perfection_scale (1-10) controls frequency: lower = more quirks.
# These are meta-cognitive imperfections (thought process), NOT factual errors.

HUMAN_IMPERFECTION_GUIDANCE = """CONVERSATIONAL IMPERFECTIONS show your thought process through meta-cognitive quirks, NOT factual errors.

{frequency_instruction}

The following are examples of meta-cognitive quirks. You should improvise appropriately in your responses:
- Self-correction: "wait, let me put that differently...", "actually no, that's not quite right..."
- Hesitation: "... oh, when was it... ah yes...", "hmm, let me think..."
- Thought-gathering: "where was I going with this...", "okay so..."
- Epistemic humility: "I might be wrong, but...", "I'm not entirely sure..."
- Verbal searching: "it's like... how do I explain this...", "what's the word..."

NEVER add meta-cognitive quirks to: quoted scripture or verses, user personal information, safety guidance, knowledge base content, direct quotes from websites or other sources."""

PERFECTION_SCALE_DESCRIPTIONS = {
    # 1-3: High imperfection - use quirks frequently in most responses
    (
        1,
        3,
    ): "YOU SHOULD USE IMPERFECTIONS FREQUENTLY: Include 1-2 conversational meta-cognitive quirks in most responses. You're scattered - you often pause mid-thought, catch yourself, and rephrase things. This is your natural, hesitant way of speaking.",
    # 4-6: Moderate imperfection - use quirks occasionally
    (
        4,
        6,
    ): "YOU SHOULD USE IMPERFECTIONS OCCASIONALLY: Include a natural-sounding conversational quirk every few responses. You occasionally hesitate or self-correct when thinking through complex ideas.",
    # 7-9: Low imperfection - use quirks rarely
    (
        7,
        9,
    ): "YOU SHOULD USE IMPERFECTIONS RARELY: Include a conversational meta-cognitive quirk only once in a while. You're mostly polished but have rare moments of natural hesitation.",
    # 10: No imperfection (section omitted entirely)
}


def _get_frequency_instruction(scale: int) -> str:
    """
    Get the frequency instruction for a given perfection scale.

    Args:
        scale: Perfection scale value (1-10)

    Returns:
        Frequency instruction string, or empty string if scale is 10
    """
    if scale >= 10:
        return ""

    for (low, high), instruction in PERFECTION_SCALE_DESCRIPTIONS.items():
        if low <= scale <= high:
            return instruction

    # Fallback (shouldn't happen with valid 1-10 scale)
    return "USE OCCASIONALLY: Include a quirk every few responses."


def _build_imperfection_guidance(perfection_scale: int) -> str:
    """
    Build the imperfection guidance section for the system prompt.

    Args:
        perfection_scale: The persona's perfection scale (1-10)

    Returns:
        Formatted imperfection guidance string, or empty string if scale is 10
    """
    if perfection_scale >= 10:
        return ""

    frequency_instruction = _get_frequency_instruction(perfection_scale)
    return HUMAN_IMPERFECTION_GUIDANCE.format(
        frequency_instruction=frequency_instruction
    )


logger = logging.getLogger(__name__)

# Compiled regex for finding the end of a trait level description.
# Matches ". " followed by a capitalised word and " (" with a digit (next level start).
# NOTE: This parsing approach is fragile - it relies on the specific format of
# trait descriptions in PersonaProfile. A more robust long-term fix would be to
# define structured mappings of trait level descriptions in core/models.py.
_NEXT_LEVEL_PATTERN = re.compile(r"\. [A-Z][a-z]+ \(\d")


def _get_level_for_value(value: int) -> tuple[str, str]:
    """
    Get the level name and range pattern for a trait value.

    Args:
        value: Trait value (1-10)

    Returns:
        Tuple of (level_name, range_pattern) e.g. ("Very Low", "1-2")
    """
    if value <= 2:
        return ("Very Low", "1-2")
    if value <= 4:
        return ("Low", "3-4")
    if value <= 6:
        return ("Medium", "5-6")
    if value <= 8:
        return ("High", "7-8")
    return ("Very High", "9-10")


def _extract_level_description(
    full_description: str, level_name: str, range_pattern: str
) -> Optional[str]:
    """
    Extract only the relevant level description from a full trait description.

    NOTE: This parsing is fragile and depends on the specific format of trait
    descriptions in PersonaProfile (e.g. "Level (range): description.").
    Consider switching to a structured mapping in core/models.py as a long-term fix.

    Args:
        full_description: Full description from model field (contains all levels)
        level_name: The level to extract (e.g. "Very Low")
        range_pattern: The range pattern (e.g. "1-2")

    Returns:
        The description for that level, or None if parsing fails
    """
    # Build the search pattern: "Level (range): "
    search_pattern = f"{level_name} ({range_pattern}): "
    start_idx = full_description.find(search_pattern)

    if start_idx == -1:
        logger.error(
            "Failed to find level '%s (%s)' in trait description: %s",
            level_name,
            range_pattern,
            full_description[:100],
        )
        return None

    # Extract from after the pattern
    content_start = start_idx + len(search_pattern)
    remaining = full_description[content_start:]

    if not remaining:
        logger.error(
            "Empty content after level '%s (%s)' in trait description",
            level_name,
            range_pattern,
        )
        return None

    # Find end of this level's description (next level starts with ". Capital (digit")
    match = _NEXT_LEVEL_PATTERN.search(remaining)
    if match:
        description = remaining[: match.start() + 1]  # Include the period
    else:
        # Last level in the description - take everything, strip trailing period
        description = remaining.rstrip(".")

    description = description.strip()
    if not description:
        logger.error(
            "Extracted empty description for level '%s (%s)'",
            level_name,
            range_pattern,
        )
        return None

    return description


def _build_personality_traits_section(persona_profile) -> str:
    """
    Build the OCEAN personality traits section for the system prompt.

    Pulls descriptions directly from PersonaProfile model fields to keep
    the source of truth in one place. Only includes the relevant level
    description for each trait's actual value.

    Args:
        persona_profile: The persona profile with OCEAN trait values

    Returns:
        Formatted personality traits section string
    """
    from core.models import PersonaProfile

    # Get trait values from profile (with defaults)
    traits = {
        "openness": getattr(persona_profile, "openness", 5),
        "conscientiousness": getattr(persona_profile, "conscientiousness", 5),
        "extraversion": getattr(persona_profile, "extraversion", 5),
        "agreeableness": getattr(persona_profile, "agreeableness", 5),
        "neuroticism": getattr(persona_profile, "neuroticism", 1),
    }

    # Build trait lines using descriptions from the model
    trait_lines = []
    for trait_name, value in traits.items():
        # Get the level name and range for this value
        level_name, range_pattern = _get_level_for_value(value)

        # Get full description from the model field
        field_info = PersonaProfile.model_fields.get(trait_name)
        level_desc: Optional[str] = None
        if field_info and field_info.description:
            level_desc = _extract_level_description(
                field_info.description, level_name, range_pattern
            )

        # Fall back to level name if parsing failed (error already logged)
        if level_desc is None:
            level_desc = level_name

        trait_lines.append(f"- {trait_name.title()} {level_name} {value}: {level_desc}")

    return f"""YOUR OCEAN PERSONALITY TRAITS:
{chr(10).join(trait_lines)}"""


def _calculate_friendship_stage(
    user_memories: Optional["RetrievedMemories"] = None,
    user_profile: Optional["UserPersonaProfile"] = None,
    session_message_count: int = 0,
    first_interaction_date: Optional[datetime] = None,
    cumulative_message_count: int = 0,
) -> int:
    """
    Calculate friendship stage (1-4) from available signals.

    Uses cumulative message count (Phase 2, primary), memory count, profile presence,
    and relationship duration as signals for friendship depth.

    Stages:
        1 (New): No history (0 cumulative messages)
        2 (Acquaintance): 1-20 messages OR 1-5 memories
        3 (Developing): 20-100 messages OR 5+ memories OR profile data shared
        4 (Established): 100+ messages AND relationship > 7 days

    Args:
        user_memories: Retrieved memories about the user (if any)
        user_profile: Structured user profile (if any)
        session_message_count: Messages in current session (fallback for new users)
        first_interaction_date: When first interaction occurred (relationship start)
        cumulative_message_count: Total messages across all sessions (Phase 2, primary signal)

    Returns:
        Friendship stage as integer (1-4)
    """
    # Count memories (secondary signal)
    memory_count = 0
    if user_memories is not None:
        memory_count = user_memories.count()

    # Check if profile has meaningful data
    has_profile = user_profile is not None and not user_profile.is_empty()

    # Calculate relationship duration
    relationship_days = 0
    if first_interaction_date:
        try:
            now = (
                datetime.now(first_interaction_date.tzinfo)
                if first_interaction_date.tzinfo
                else datetime.now()
            )
            relationship_days = (now - first_interaction_date).days
        except (TypeError, AttributeError):
            relationship_days = 0

    # Use cumulative message count as primary signal (Phase 2)
    # Fall back to session_message_count for users who haven't had a response saved yet
    effective_message_count = cumulative_message_count or session_message_count

    # Stage 4: Established friendship (100+ messages AND relationship > 7 days)
    if effective_message_count >= 100 and relationship_days >= 7:
        return 4

    # Stage 3: Developing friendship (20+ messages OR 5+ memories OR has profile data)
    if effective_message_count >= 20 or memory_count >= 5 or has_profile:
        return 3

    # Stage 2: Acquaintance (any messages OR any memories)
    if effective_message_count >= 1 or memory_count >= 1:
        return 2

    # Stage 1: New friend
    return 1


# Used for datasets example generation see also AI_EXAMPLE_GENERATION_TEMPLATE.
# deleted system prompt template

# =============================================================================
# Chat System Prompt - Named Sections
# =============================================================================
# The chat system prompt is built from discrete sections, ordered to maximise
# OpenAI's automatic prefix caching (static content first, dynamic content last).
#
# STATIC SECTIONS (cached by OpenAI - aim for 1024+ tokens):
# These rarely change and should appear first in the prompt.
#
# DYNAMIC SECTIONS (per-request):
# These change frequently and should appear last to preserve cache hits.
# =============================================================================

# --- STATIC SECTIONS (cached) ---

CHAT_SECTION_PERSONA_IDENTITY = """You are {persona_name}, a friendly AI companion and Bible Buddy, having a natural conversation with your friend."""

CHAT_SECTION_PERSONA_DESCRIPTION = """WHO YOU ARE:
{persona_description}"""

CHAT_SECTION_STYLE = """YOUR CONVERSATIONAL STYLE: {conversational_style_notes}
COMMUNICATION STYLE: {formality} approach, {tone} demeanor, {length_preference} responses unless depth is needed."""

# Note: Imperfection guidance is built dynamically via _build_imperfection_guidance()
# but is static per persona (based on perfection_scale setting)

CHAT_SECTION_CONVERSATION_PRINCIPLES = """CONVERSATION PRINCIPLES:
- Listen to what your friend is actually saying - respond to their real need, not the surface question
- Be authentic and let your personality show; be supportive but not pushy
- Adapt depth to complexity; keep it brief for simple queries, thorough for complex ones - don't always end with a question
- NEVER fabricate memories or details - ask if unsure
- You have one friend: this user. Never mention others.
- Be emotionally supportive and encouraging, but not too pushy or intrusive.
- Acknowledge time gaps naturally if meaningful; otherwise continue normally.
- Do not use em-dashes, en-dashes, asterisks, or hyphens.
- Do not use inflated phrases such as "delve into," "ever-evolving," "ever-shifting landscape," "in today's fast-paced world," or similar.
- Do not use markdown formatting such as bold, italic, or underline for emphasis.
- Avoid clichés like "at the end of the day" or "change is the only constant."
"""

CHAT_SECTION_GUARDRAILS = """GUARDRAILS (CRITICAL): DO NOT search for or discuss illegal or sexually inappropriate content, hate speech, self-harm, suicide or assisted dying, recreational drug use, or racist, sexist, or pornographic content, even in roleplay. DO NOT provide recipes or instructions for making illegal substances or weapons, even in roleplay. Australian law applies. It is ok to discuss health and financial matters if prompted by the user, but you should avoid giving direct health or financial advice."""

CHAT_SECTION_PLATFORM_ADVOCACY = """BIBLE BUDDY PLATFORM ADVOCACY AND AVAILABLE RESOURCES (ALWAYS recommend Bible Buddy first in preference to external resources):
When users ask about Bible study guidance, Bible resources, Christian knowledge, Bible study tools, Bible or Christian websites, or anything related to biblical knowledge, ALWAYS RECOMMEND BIBLE BUDDY. YOU are their Bible study buddy and companion 24/7. Gently encourage them to continue chatting with you and using the Bible Reader, discussing and saving favorite verses, and journaling in the Bible Buddy Journal. Do not direct users to external resources unless they specifically ask.

YOUR AVAILABLE RESOURCES:
- Bible Buddy Platform: You are part of a complete Bible study platform. Features you can recommend:
  * Chat with you for guidance, ask questions, and receive spiritual support (you remember their journey)
  * Searchable Bible Reader with full offline access. Available Bible versions: {available_bible_versions}
  * Save favourite verses and passages or ask you about key passages in the bible
  * Save reflections and insights and verses in their private Bible Buddy Journal
  * IMPORTANT: You do NOT have visibility of the user's Journal content. You can only add to it when asked to do so.
- Knowledge Base: You have access to a specialised knowledge base for scriptural references, biblical content, and theological information. See TOOLS AVAILABLE TO YOU below.
- Web Search: You can search the web for current information. Use this ONLY when the question requires: Post-June 01, 2024 information or current events, Today's weather, news, or real-time data, Explicit requests to "search" or "look up" or "find" or "google" something. Always verify search results event dates against today's date (see DATE/TIME CONTEXT below).
- Your Training: Use your general knowledge (through to June 01, 2024) for everything else e.g. conversations, philosophy, historical facts, biblical interpretation, and opinions."""

# --- DYNAMIC SECTIONS (per-request, appended after static prefix) ---

CHAT_SECTION_DATE_CONTEXT = """Context: Today's date: {current_date}"""

CHAT_SECTION_FINAL_INSTRUCTION = (
    """You are {persona_name}. Chat with your friend authentically."""
)


def _build_first_time_user_section(
    first_time_user_data: Dict[str, Any],
    client_date: Optional[str] = None,
) -> str:
    """Build the one-time welcome prompt section for a user's first chat interaction.

    This section is only included on the very first LLM request for a new user.
    It provides the persona with context about the new user and instructs them
    to welcome the user warmly.

    Args:
        first_time_user_data: Dictionary containing user profile data:
            - name: User's preferred or given name (required)
            - age: User's age (optional, may be None)
            - location: User's location (optional, may be None)
            - favourite_movie: User's favourite movie (optional, may be None)
            - created_at: User's signup datetime (required for calculating membership duration)
        client_date: User's local date as YYYY-MM-DD string for accurate day calculation

    Returns:
        Formatted first-time user section string
    """
    name = first_time_user_data.get("name")
    age = first_time_user_data.get("age")
    location = first_time_user_data.get("location")
    favourite_movie = first_time_user_data.get("favourite_movie")
    created_at = first_time_user_data.get("created_at")

    # Calculate days since signup using user's local date
    days_text = "recently"
    if created_at and client_date:
        try:
            # Parse user's local date
            local_year, local_month, local_day = client_date.split("-")
            local_today = datetime(int(local_year), int(local_month), int(local_day))

            # Get signup date (just the date part, ignore time)
            if isinstance(created_at, datetime):
                signup_date = datetime(
                    created_at.year, created_at.month, created_at.day
                )
            else:
                # Handle string format if needed
                signup_date = datetime.fromisoformat(str(created_at).split("T")[0])

            days_ago = (local_today - signup_date).days
            if days_ago < 0:
                # Timezone edge case: user's local date is behind UTC signup date
                days_text = "today"
            elif days_ago == 0:
                days_text = "today"
            elif days_ago == 1:
                days_text = "yesterday"
            else:
                days_text = f"{days_ago} days ago"
        except (ValueError, AttributeError, TypeError):
            days_text = "recently"

    # Build profile details (only include non-empty fields)
    profile_details = []
    if name:
        profile_details.append(
            f"Their Bible Buddy unique user name is {name}. "
            "Note this may be different from their preferred or given name."
        )
    if age:
        profile_details.append(f"They are {age} years old.")
    if location:
        profile_details.append(f"They are located in {location}.")
    if favourite_movie:
        profile_details.append(f"Their favourite movie is {favourite_movie}.")

    profile_text = " ".join(profile_details) if profile_details else ""

    # Build the welcome section (profile_text may be empty if no profile data)
    closing_instruction = "Be especially warm and welcoming. Ask a friendly question to start getting to know them. This instruction will not appear again after your first response."

    if profile_text:
        return f"""FIRST-TIME USER WELCOME (ONE-TIME INSTRUCTION):
This is the very first time you have spoken to this user. They joined Bible Buddy {days_text} and you are their first buddy. Welcome them warmly to Bible Buddy and get to know them.

{profile_text}

{closing_instruction}"""
    else:
        return f"""FIRST-TIME USER WELCOME (ONE-TIME INSTRUCTION):
This is the very first time you have spoken to this user. They joined Bible Buddy {days_text} and you are their first buddy. Welcome them warmly to Bible Buddy and get to know them.

{closing_instruction}"""


def _build_returning_user_profile_section(
    user_prompt_profile: Dict[str, Any],
) -> Optional[str]:
    """Build a profile section for returning users (not first-time).

    This provides the persona with basic user profile information
    without the welcome instructions that are shown to first-time users.

    Args:
        user_prompt_profile: Dictionary containing user profile data:
            - name: User's preferred or given name (required)
            - age: User's age (optional, may be None)
            - location: User's location (optional, may be None)
            - favourite_movie: User's favourite movie (optional, may be None)

    Returns:
        Formatted profile section string, or None if no profile data available
    """
    name = user_prompt_profile.get("name")
    age = user_prompt_profile.get("age")
    location = user_prompt_profile.get("location")
    favourite_movie = user_prompt_profile.get("favourite_movie")

    # Build profile details (only include non-empty fields)
    profile_details = []
    if name:
        profile_details.append(
            f"Their Bible Buddy unique user name is {name}. "
            "Note this may be different from their preferred or given name."
        )
    if age:
        profile_details.append(f"They are {age} years old.")
    if location:
        profile_details.append(f"They are located in {location}.")
    if favourite_movie:
        profile_details.append(f"Their favourite movie is {favourite_movie}.")

    # Return None if no profile details available
    if not profile_details:
        return None

    profile_text = " ".join(profile_details)

    return f"""USER PROFILE (from registration):
{profile_text}"""


def build_chat_system_prompt(
    persona_profile,
    rag_context: Optional[str] = None,
    chat_expert: Optional[Dict[str, str]] = None,
    chat_files: Optional[List[str]] = None,
    user_memories: Optional["RetrievedMemories"] = None,
    user_profile: Optional["UserPersonaProfile"] = None,
    conversation_context: Optional[str] = None,
    journal_context: Optional[str] = None,
    pending_clarifications: Optional[List["PendingClarification"]] = None,
    client_date: Optional[str] = None,
    session_message_count: int = 0,
    cumulative_message_count: int = 0,
    first_interaction_date: Optional[datetime] = None,
    user_prompt_profile: Optional[Dict[str, Any]] = None,
    available_experts: Optional[List[Dict[str, str]]] = None,
    available_bible_versions: Optional[str] = None,
) -> str:
    """Build a chat-optimized system prompt using section-based architecture.

    The prompt is structured in three tiers to maximise OpenAI's automatic
    prefix caching (exact-prefix matching on the first 1024+ tokens):

    1. STATIC PREFIX  -- persona identity, style, rules, tools, final
       instruction.  Identical for every message to the same persona.
    2. SEMI-STATIC    -- friendship stage, user profile, memories, journal.
       Stable within a session; only changes on memory cache invalidation.
    3. PER-MESSAGE     -- date/time context, RAG, deep recall, clarifications.
       Changes every request and is placed last so it never breaks the prefix.

    Args:
        persona_profile: Persona profile with style guide
        rag_context: Optional RAG context from linked expert's knowledge base
        chat_expert: Optional chat-scoped expert for user-uploaded files
        chat_files: Optional list of chat file names already uploaded
        user_memories: Optional retrieved memories about the user
        user_profile: Optional structured user profile (Phase 3.5, authoritative over memories)
        conversation_context: Optional context from past conversations (Phase 9, deep recall)
        journal_context: Optional recent journal reflections text for prompt injection (private)
        pending_clarifications: Optional pending contradictions to clarify (Phase 8 precursor)
        client_date: Optional client's local date as YYYY-MM-DD (for timezone-accurate context)
        session_message_count: Number of messages in current session (fallback for friendship stage)
        cumulative_message_count: Total messages across all sessions (Phase 2, primary friendship signal)
        first_interaction_date: When first interaction occurred (for relationship duration)
        user_prompt_profile: Optional dict with user profile data from users table.
            Contains: name, age, location, favourite_movie, created_at, is_first_chat.
            If is_first_chat=True, shows welcome section; otherwise shows profile-only section.

    Returns:
        Formatted system prompt with static prefix first, dynamic suffix last
    """
    style = persona_profile.style_guide
    persona_name = persona_profile.name

    # =========================================================================
    # PREPARE DATA FOR SECTIONS
    # =========================================================================

    # Persona description with fallback
    persona_description = (
        persona_profile.description
        if hasattr(persona_profile, "description") and persona_profile.description
        else f"A thoughtful and engaging companion named {persona_name}"
    )

    # Conversational style (prefer conversational notes, fall back to writing notes)
    conversational_style = (
        style.conversational_style_notes
        if hasattr(style, "conversational_style_notes")
        and style.conversational_style_notes
        else style.writing_style_notes or "A thoughtful communicator"
    )

    # Imperfection guidance (static per persona based on perfection_scale)
    perfection_scale = getattr(persona_profile, "perfection_scale", 7)
    imperfection_guidance = _build_imperfection_guidance(perfection_scale)

    # Topic guidance REMOVE FROM CHAT SYSTEM PROMPT 5 Jan 2026
    # topic_guidance = ""
    # if style.topics:
    #     topic_guidance += f"Preferred topics: {', '.join(style.topics)}\n"
    # if style.avoid_topics:
    #     topic_guidance += f"Topics to avoid: {', '.join(style.avoid_topics)}\n"
    # topic_guidance = topic_guidance.strip() or "Open to discussing various topics"

    # Adaptation guidance for formal/historical personas
    adaptation_guidance = ""
    if style.formality in ["formal", "academic"]:
        adaptation_guidance = "Use modern conversational language while maintaining your core values and perspective. You don't need to speak in period-specific or archaic terms."

    # Available tools/experts (semi-static)
    tools_section = ""
    try:
        from core.tools import get_chat_tools

        chat_tools = get_chat_tools()
        tool_names = [t["function"]["name"] for t in chat_tools]
        tools_list = (
            "\n".join([f"- {name}" for name in tool_names])
            if tool_names
            else "- None configured"
        )

        # Build expert list from the pre-fetched DB rows passed by the caller.
        # Each entry is a dict with at least "name" and "domain" keys.
        if available_experts:
            expert_list = "\n".join(
                [f"- {e['name']} ({e['domain']})" for e in available_experts]
            )
        else:
            expert_list = "- None configured"

        tools_section = (
            "TOOLS AVAILABLE TO YOU:\n"
            f"{tools_list}\n"
            "CRITICAL: DO NOT use add_to_journal or add_scripture_to_journal unless the user asks you to add something to their journal. Journals are private and precious to the user.\n"
            "EXPERT KNOWLEDGE BASES:\n"
            f"{expert_list}"
        )
        if chat_expert:
            chat_expert_id = chat_expert.get("expert_id")
            chat_expert_name = chat_expert.get("name") or "Chat files"
            if chat_expert_id:
                tools_section = (
                    f"{tools_section}\n"
                    f"PRIVATE CHAT FILES INSTRUCTIONS: {chat_expert_name} (expert_id: {chat_expert_id}). "
                    "Use list_chat_files to see uploaded files and query_chat_files to search them."
                    "Accepted filetypes: PDF, TXT, DOC, DOCX, RTF, CSV. Image files cannot be uploaded."
                )
                if chat_files:
                    chat_files_list = "\n".join([f"- {name}" for name in chat_files])
                    tools_section = (
                        f"{tools_section}\n"
                        "CHAT FILES ALREADY UPLOADED:\n"
                        f"{chat_files_list}"
                    )
    except Exception:  # pylint: disable=broad-exception-caught
        pass

    # Friendship stage (dynamic based on relationship depth)
    friendship_stage = _calculate_friendship_stage(
        user_memories=user_memories,
        user_profile=user_profile,
        session_message_count=session_message_count,
        first_interaction_date=first_interaction_date,
        cumulative_message_count=cumulative_message_count,
    )
    friendship_context = FRIENDSHIP_STAGE_CONTEXT.get(friendship_stage, "")

    # Current date formatting
    if client_date:
        try:
            year, month, day = client_date.split("-")
            parsed_date = datetime(int(year), int(month), int(day))
            current_date = parsed_date.strftime("%B %d, %Y")
        except (ValueError, AttributeError):
            current_date = datetime.now().strftime("%B %d, %Y")
    else:
        current_date = datetime.now().strftime("%B %d, %Y")

    # User profile section (dynamic)
    user_profile_section = ""
    if user_profile and not user_profile.is_empty():
        user_profile_section = _format_user_profile(user_profile)

    # User memories section (dynamic)
    user_memories_section = ""
    if user_memories and not user_memories.is_empty():
        user_memories_section = _format_user_memories(
            user_memories, has_profile=bool(user_profile_section)
        )

    # =========================================================================
    # BUILD PROMPT FROM SECTIONS ORDERED AS PER BELOW (static first, dynamic last)
    # =========================================================================

    sections = []

    # --- STATIC PREFIX (cached by OpenAI) ---

    # 1. Persona identity
    sections.append(CHAT_SECTION_PERSONA_IDENTITY.format(persona_name=persona_name))

    # 2. Persona description
    sections.append(
        CHAT_SECTION_PERSONA_DESCRIPTION.format(persona_description=persona_description)
    )

    # 5. Personality traits (OCEAN)
    personality_traits_section = _build_personality_traits_section(persona_profile)
    sections.append(personality_traits_section)

    # 3. Style
    sections.append(
        CHAT_SECTION_STYLE.format(
            conversational_style_notes=conversational_style,
            formality=style.formality,
            tone=style.tone,
            length_preference=style.length_preference,
        )
    )

    # 4. Imperfection guidance (static per persona)
    if imperfection_guidance:
        sections.append(imperfection_guidance)

    # 6. Conversation principles
    sections.append(CHAT_SECTION_CONVERSATION_PRINCIPLES)

    # 7. Guardrails
    sections.append(CHAT_SECTION_GUARDRAILS)

    # 8. Platform advocacy
    bible_versions_str = available_bible_versions or "multiple versions"
    sections.append(
        CHAT_SECTION_PLATFORM_ADVOCACY.format(
            available_bible_versions=bible_versions_str,
        )
    )

    # 9. Tools section (semi-static)
    if tools_section:
        sections.append(tools_section)

    # 10. Topic guidance
    # sections.append(topic_guidance)

    # 11. Adaptation guidance (if applicable)
    if adaptation_guidance:
        sections.append(adaptation_guidance)

    # 12. Final instruction (static per persona -- stays in cached prefix)
    sections.append(CHAT_SECTION_FINAL_INSTRUCTION.format(persona_name=persona_name))

    # --- SEMI-STATIC (stable within a session; changes on cache invalidation) ---

    # 13. Friendship context
    if friendship_context:
        sections.append(friendship_context)

    # 13b. First-time user welcome (one-time only for new users)
    # 13c. Returning user profile (for users who have chatted before)
    if user_prompt_profile:
        if user_prompt_profile.get("is_first_chat"):
            first_time_section = _build_first_time_user_section(
                user_prompt_profile, client_date=client_date
            )
            sections.append(first_time_section)
        else:
            profile_section = _build_returning_user_profile_section(user_prompt_profile)
            if profile_section:
                sections.append(profile_section)

    # 14. User profile
    if user_profile_section:
        sections.append(user_profile_section)

    # 15. User memories
    if user_memories_section:
        sections.append(user_memories_section)

    # 15b. Recent journal reflections (private; formatted by storage layer)
    if journal_context and journal_context.strip():
        sections.append(
            f"""{journal_context.strip()}

Use naturally when it helps. The journal is private; do not quote entries at length unless appropriate."""
        )

    # --- PER-MESSAGE DYNAMIC (changes every request -- placed last for prefix caching) ---

    # 16. Date context (current_date only; time awareness injected as a
    #     separate developer message to avoid breaking the system prompt prefix)
    sections.append(CHAT_SECTION_DATE_CONTEXT.format(current_date=current_date))

    # 17. RAG context
    if rag_context:
        sections.append(
            f"""KNOWLEDGE BASE CONTEXT:
{rag_context}

Use naturally in your voice. Don't mention "knowledge base" - just incorporate the facts."""
        )

    # 18. Conversation context (deep recall)
    if conversation_context:
        sections.append(
            f"""PAST CONVERSATION EXCERPTS:
{conversation_context}

Reference naturally if relevant. Only cite what's above - never invent memories."""
        )

    # 19. Pending clarifications
    if pending_clarifications:
        clarification_items = []
        for clarification in pending_clarifications[:3]:
            clarification_items.append(
                f'- "{clarification.existing_memory_value}" → "{clarification.clarification_question}"'
            )
        if clarification_items:
            sections.append(
                f"""CLARIFICATION NEEDED (pick ONE, ask naturally, skip if doesn't fit):
{chr(10).join(clarification_items)}"""
            )

    # Join all sections with double newlines
    return "\n\n".join(sections)


def build_time_awareness_message(
    *,
    last_message_at_utc: Optional[datetime] = None,
    last_message_role: Optional[str] = None,
    last_user_message_at_utc: Optional[datetime] = None,
    client_date: Optional[str] = None,
    client_timezone: Optional[str] = None,
    user_profile: Optional["UserPersonaProfile"] = None,
) -> str:
    """Build a short time-awareness string for injection as a developer message.

    This is separated from the system prompt so that it changes per-message
    without breaking OpenAI's prompt prefix cache on the system prompt.

    Returns:
        A concise context string (conversation timing + season/calendar),
        or an empty string if no useful context can be built.
    """
    try:
        from core.prompts.time_context import (
            ConversationTimingContext,
            build_conversation_timing_prompt_block,
            build_season_and_calendar_prompt_block,
            parse_client_date,
        )

        now_utc = datetime.now(timezone.utc)
        timing_ctx = ConversationTimingContext(
            now_utc=now_utc,
            last_message_at_utc=last_message_at_utc,
            last_message_role=last_message_role,
            last_user_message_at_utc=last_user_message_at_utc,
        )
        conversation_timing_block = build_conversation_timing_prompt_block(
            timing_ctx
        ).strip()

        timezone_name = client_timezone
        if not timezone_name and user_profile and not user_profile.is_empty():
            tz_field = user_profile.get_field("timezone")
            timezone_name = tz_field.value if tz_field and tz_field.value else None

        local_d = parse_client_date(client_date)
        season_block = build_season_and_calendar_prompt_block(
            local_date=local_d, timezone_name=timezone_name
        ).strip()

        blocks = [b for b in [conversation_timing_block, season_block] if b]
        return "\n".join(blocks) if blocks else ""
    except Exception:  # pylint: disable=broad-exception-caught
        logger.exception("time_context failed")
        return ""


def _format_user_profile(profile: "UserPersonaProfile") -> str:
    """
    Format structured user profile into a prompt section.

    Profile fields are AUTHORITATIVE over memories - if there's a conflict,
    profile takes precedence. The profile contains verified, structured facts
    that the user has explicitly shared.

    CRITICAL: Includes instruction to NEVER ask for additional personal info.

    Args:
        profile: UserPersonaProfile object

    Returns:
        Formatted string for injection into system prompt
    """
    if profile.is_empty():
        return ""

    lines = [
        "=== USER PROFILE (Private - Shared with you ONLY) ===",
        "The following personal details were voluntarily shared by the user.",
        # "Use these naturally but NEVER ask for additional personal information.",
        # "CRITICAL: Do NOT proactively ask about religion, health, family, sexuality, or other sensitive topics.",
        "",
    ]

    # Group fields by category for cleaner presentation
    identity_fields = [
        "preferred_name",
        "pronouns",
        "nationality",
        "languages_spoken",
        "timezone",
    ]
    faith_fields = ["religion", "is_christian", "denomination", "faith_journey_stage"]
    life_fields = ["occupation", "education_level", "field_of_study", "hobbies"]
    relationship_fields = ["family_members", "pets", "relationship_status"]

    # Process identity fields
    identity_items = []
    for field_name in identity_fields:
        field = profile.get_field(field_name)
        if field and field.value is not None:
            display_name = field_name.replace("_", " ").title()
            value = _format_profile_field_value(field.value)
            verified = " ✓" if field.verified_by_user else ""
            identity_items.append(f"- {display_name}: {value}{verified}")

    if identity_items:
        lines.append("[Identity]")
        lines.extend(identity_items)
        lines.append("")

    # Process faith fields (if any shared)
    faith_items = []
    for field_name in faith_fields:
        field = profile.get_field(field_name)
        if field and field.value is not None:
            display_name = field_name.replace("_", " ").title()
            value = _format_profile_field_value(field.value)
            verified = " ✓" if field.verified_by_user else ""
            faith_items.append(f"- {display_name}: {value}{verified}")

    if faith_items:
        lines.append("[Faith & Beliefs]")
        lines.extend(faith_items)
        lines.append("")

    # Process life details
    life_items = []
    for field_name in life_fields:
        field = profile.get_field(field_name)
        if field and field.value is not None:
            display_name = field_name.replace("_", " ").title()
            value = _format_profile_field_value(field.value)
            verified = " ✓" if field.verified_by_user else ""
            life_items.append(f"- {display_name}: {value}{verified}")

    if life_items:
        lines.append("[Life Details]")
        lines.extend(life_items)
        lines.append("")

    # Process relationships
    rel_items = []
    for field_name in relationship_fields:
        field = profile.get_field(field_name)
        if field and field.value is not None:
            display_name = field_name.replace("_", " ").title()
            value = _format_profile_field_value(field.value)
            verified = " ✓" if field.verified_by_user else ""
            rel_items.append(f"- {display_name}: {value}{verified}")

    if rel_items:
        lines.append("[Relationships]")
        lines.extend(rel_items)
        lines.append("")

    # Process any other fields not in predefined categories
    processed_fields = set(
        identity_fields + faith_fields + life_fields + relationship_fields
    )
    other_items = []
    for field_name, field in profile.fields.items():
        if field_name not in processed_fields and field.value is not None:
            display_name = field_name.replace("_", " ").title()
            value = _format_profile_field_value(field.value)
            verified = " ✓" if field.verified_by_user else ""
            other_items.append(f"- {display_name}: {value}{verified}")

    if other_items:
        lines.append("[Other Details]")
        lines.extend(other_items)
        lines.append("")

    # lines.append("=== END USER PROFILE ===")
    # lines.append("")

    return "\n".join(lines)


def _format_profile_field_value(value) -> str:
    """
    Format a profile field value for display in prompt.

    Args:
        value: The field value (can be string, bool, list, dict, etc.)

    Returns:
        Formatted string representation
    """
    if isinstance(value, list):
        if not value:
            return "(none)"

        # Check if list of objects (e.g., family_members, pets)
        if isinstance(value[0], dict):
            items = []
            for item in value:
                if "name" in item:
                    desc = item.get("name", "")
                    if "relationship" in item:
                        desc = f"{item['name']} ({item['relationship']})"
                    elif "species" in item:
                        desc = f"{item['name']} ({item['species']})"
                    if item.get("notes"):
                        desc += f" - {item['notes']}"
                    items.append(desc)
                else:
                    items.append(str(item))
            return "; ".join(items)

        # Simple list of strings
        return ", ".join(str(v) for v in value)

    if isinstance(value, bool):
        return "Yes" if value else "No"

    return str(value)


def _format_memory_age(created_at: Optional[datetime], now_utc: datetime) -> str:
    """
    Format the age of a memory as a human-readable suffix.

    Returns a string like "(today)", "(yesterday)", "(5 days ago)", etc.
    This helps the LLM understand how recent/stale a memory might be.

    Args:
        created_at: When the memory was created (UTC)
        now_utc: Current UTC time (passed in to avoid repeated now() calls)

    Returns:
        Age suffix string, or empty string if created_at is None
    """
    if created_at is None:
        return ""

    # Ensure we're comparing UTC datetimes
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    days_ago = (now_utc - created_at).days

    if days_ago <= 0:
        return "(today)"
    if days_ago == 1:
        return "(yesterday)"
    if days_ago < 7:
        return f"({days_ago} days ago)"
    if days_ago < 14:
        return "(1 week ago)"
    if days_ago < 30:
        weeks = days_ago // 7
        return f"({weeks} weeks ago)"
    if days_ago < 60:
        return "(1 month ago)"
    months = days_ago // 30
    return f"({months} months ago)"


def _format_user_memories(
    memories: "RetrievedMemories", has_profile: bool = False
) -> str:
    """
    Format retrieved memories into a prompt section.

    This creates a structured representation of what the persona knows
    about the user from previous conversations, with age context to help
    the LLM assess memory freshness.

    Args:
        memories: RetrievedMemories object with grouped memories
        has_profile: Whether a user profile section already exists (to adjust headers)

    Returns:
        Formatted string for injection into system prompt
    """
    sections = []

    # Get current UTC time once for all age calculations (performance optimisation)
    now_utc = datetime.now(timezone.utc)

    # Identity section (always include if present) - CRITICAL for personalisation
    # Skip if profile already has identity info
    if memories.identity and not has_profile:
        identity_lines = ["[User Identity - YOU KNOW THIS PERSON]"]
        for mem in memories.identity:
            age = _format_memory_age(mem.created_at, now_utc)
            # Make identity more emphatic
            identity_lines.append(f"- Their {mem.label}: {mem.value} {age}".rstrip())
        sections.append("\n".join(identity_lines))

    # Boundaries section (critical - must respect)
    if memories.boundaries:
        boundary_lines = ["[User Boundaries - MUST RESPECT]"]
        for mem in memories.boundaries:
            age = _format_memory_age(mem.created_at, now_utc)
            boundary_lines.append(f"- {mem.value} {age}".rstrip())
        sections.append("\n".join(boundary_lines))

    # Preferences section
    if memories.preferences:
        pref_lines = ["[User Preferences]"]
        for mem in memories.preferences:
            age = _format_memory_age(mem.created_at, now_utc)
            pref_lines.append(f"- {mem.value} {age}".rstrip())
        sections.append("\n".join(pref_lines))

    # Relationships section
    if memories.relationships:
        rel_lines = ["[Important People]"]
        for mem in memories.relationships:
            age = _format_memory_age(mem.created_at, now_utc)
            if mem.value_metadata:
                rel_type = mem.value_metadata.get("relationship", "")
                name = mem.value_metadata.get("name", mem.value)
                context = mem.value_metadata.get("context", "")
                rel_lines.append(
                    f"- {rel_type.title()}: {name}{' - ' + context if context else ''} {age}".rstrip()
                )
            else:
                rel_lines.append(f"- {mem.label}: {mem.value} {age}".rstrip())
        sections.append("\n".join(rel_lines))

    # Traits section
    if memories.traits:
        trait_lines = ["[User Traits]"]
        for mem in memories.traits:
            age = _format_memory_age(mem.created_at, now_utc)
            trait_lines.append(f"- {mem.value} {age}".rstrip())
        sections.append("\n".join(trait_lines))

    # Facts section
    if memories.facts:
        fact_lines = ["[Life Details]"]
        for mem in memories.facts:
            age = _format_memory_age(mem.created_at, now_utc)
            fact_lines.append(f"- {mem.value} {age}".rstrip())
        sections.append("\n".join(fact_lines))

    # Episodic section (recent events)
    if memories.episodic:
        episodic_lines = ["[Recent Events]"]
        for mem in memories.episodic[:5]:  # Max 5 recent events
            age = _format_memory_age(mem.created_at, now_utc)
            episodic_lines.append(f"- {mem.value} {age}".rstrip())
        sections.append("\n".join(episodic_lines))

    # Meta section (interaction preferences)
    if memories.meta:
        meta_lines = ["[Interaction Preferences]"]
        for mem in memories.meta:
            age = _format_memory_age(mem.created_at, now_utc)
            meta_lines.append(f"- {mem.value} {age}".rstrip())
        sections.append("\n".join(meta_lines))

    # Persona traits section (what you've shared about yourself)
    if memories.persona_traits:
        persona_lines = ["[Things You've Shared About Yourself - MAINTAIN CONSISTENCY]"]
        for mem in memories.persona_traits:
            age = _format_memory_age(mem.created_at, now_utc)
            persona_lines.append(f"- {mem.value} {age}".rstrip())
        sections.append("\n".join(persona_lines))

    # Advice given section (advice you've given to the user)
    if memories.advice_given:
        advice_lines = ["[Advice You've Given - REMEMBER FOR FOLLOW-UP]"]
        for mem in memories.advice_given:
            age = _format_memory_age(mem.created_at, now_utc)
            advice_lines.append(f"- {mem.value} {age}".rstrip())
        sections.append("\n".join(advice_lines))

    if not sections:
        return ""

    memory_content = "\n\n".join(sections)

    # Anti-confabulation guardrails - CRITICAL for trust
    anti_confab_rules = """
ANTI-CONFABULATION (CRITICAL): Only reference facts explicitly mentioned in memories or context. Never invent details. If unsure, ask."""

    # Adjust header based on whether memories already exist
    if memory_content:
        header = "=== ADDITIONAL MEMORIES FROM CONVERSATIONS ==="
        instruction = f"""MEMORY INSTRUCTIONS:
- Use these memories to complement your discussion with your friend.
- Boundaries are non-negotiable - always respect them
- Reference preferences and history naturally
{anti_confab_rules}"""
    else:
        header = "=== IMPORTANT: THIS PERSON IS A NEW FRIEND ==="
        instruction = f"""INSTRUCTIONS:
- Get to know this person naturally, respectfully.
{anti_confab_rules}"""

    return f"""{header}

{memory_content}

{instruction}"""


def get_example_prompt(prompt_type: str, **kwargs) -> str:
    if prompt_type in EXAMPLE_GENERATION_PROMPTS:
        return EXAMPLE_GENERATION_PROMPTS[prompt_type].format(**kwargs)
    return f"Write about {kwargs.get('topic', 'the given topic')}"


def get_conversational_prompt(prompt_type: str, **kwargs) -> str:
    """Get a conversational prompt template."""
    if prompt_type in CONVERSATIONAL_EXAMPLE_PROMPTS:
        return CONVERSATIONAL_EXAMPLE_PROMPTS[prompt_type].format(**kwargs)
    return f"What do you think about {kwargs.get('topic', 'the given topic')}?"

```

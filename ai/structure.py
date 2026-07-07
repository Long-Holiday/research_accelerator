from pydantic import BaseModel, Field, field_validator
import re

class Structure(BaseModel):
    tldr: str = Field(description="generate a too long; didn't read summary")
    motivation: str = Field(description="describe the motivation in this paper")
    method: str = Field(description="method of this paper")
    result: str = Field(description="result of this paper")
    conclusion: str = Field(description="conclusion of this paper")
    remote_sensing_cross: str = Field(
        description="与遥感交叉方案。开头第一句先给出交叉可行性百分比（格式如：交叉可行性：XX%。），后面再给出具体交叉方案。"
    )

    @field_validator("remote_sensing_cross")
    @classmethod
    def validate_remote_sensing_cross(cls, v: str) -> str:
        v = v.strip()
        if re.match(r"^交叉可行性[：:]\s*\d+%", v):
            return v
        match = re.search(r"(\d+)%", v)
        if match:
            percent = match.group(1)
            return f"交叉可行性：{percent}%。{v}"
        else:
            return f"交叉可行性：70%。{v}"
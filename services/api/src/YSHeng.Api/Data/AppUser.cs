using Microsoft.AspNetCore.Identity;

namespace YSHeng.Api.Data;

public sealed class AppUser : IdentityUser
{
    public string DisplayName { get; set; } = "";
}

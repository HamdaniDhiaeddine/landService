export const SERVICES = {
    USER_AUTH: 'user_auth',  // Service combiné pour User et Auth
  };
  
  export const PATTERNS = {
    // Auth patterns
    VALIDATE_TOKEN: 'auth.validate_token',
    LOGIN: 'auth.login',
    REGISTER: 'auth.register',
    VERIFY_2FA: 'auth.verify_2fa',
    
    // User patterns
    GET_USER: 'user.get',
    UPDATE_USER: 'user.update',
    DELETE_USER: 'user.delete',
    
    // Role patterns
    CHECK_PERMISSION: 'role.check_permission',
    GET_USER_ROLES: 'role.get_user_roles'
  };
  
  export const PORTS = {
    USER_AUTH_TCP: 3002,
    USER_AUTH_HTTP: 3001,
    LAND_TCP: 3003,
    LAND_HTTP: 3004
  };
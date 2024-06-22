<?php
/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the website, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * ABSPATH
 *
 * @link https://wordpress.org/documentation/article/editing-wp-config-php/
 *
 * @package WordPress
 */

// ** Database settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', 'wordpress' );

/** Database username */
define( 'DB_USER', 'root' );

/** Database password */
define( 'DB_PASSWORD', 'root' );

/** Database hostname */
define( 'DB_HOST', 'localhost' );

/** Database charset to use in creating database tables. */
define( 'DB_CHARSET', 'utf8mb4' );

/** The database collate type. Don't change this if in doubt. */
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 *
 * Change these to different unique phrases! You can generate these using
 * the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}.
 *
 * You can change these at any point in time to invalidate all existing cookies.
 * This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',         'EH =_n[tlO?T)P*3XE!E~+VMVG=I#L9D#7#|H7Ebe{~g[l+Q?Al);IOY4y|0LmMr' );
define( 'SECURE_AUTH_KEY',  'nsj)s2:x8O^65+rx9TvOo_Il9|cQ>Y|@_hnepCsuQLY4:X6VxXgy^G(|N{J{c/F3' );
define( 'LOGGED_IN_KEY',    '=s&rxEi.zN-JO$l*EOs>)fIv`o(NB?mWSt6ZYq8w.pJpdNy*luw6@%OBcPh[okVr' );
define( 'NONCE_KEY',        'KTA<UVQreOse?!qe(-Q%Gt/g5mRR_r7inxc[.SB_ud! MQ}c:,Aw31[FxA)Jebg{' );
define( 'AUTH_SALT',        '@xKYDX|<:47;yrB2uqe[M4?ocYFbI:G%ad_ `eu7IYf6A%MrP&yDI)Ldc;O%Cw_V' );
define( 'SECURE_AUTH_SALT', 'Elm&D9N/x/wi/FwkWXnl/v!B-}[!xK[qw7x+;YMH+%*1TE{kYBoqc?3_HL3Qn(KX' );
define( 'LOGGED_IN_SALT',   '~NIZt~U3)uA9iN29>PA*|sYFzZm0!;jwW;!oc*xYZ1srR+@Gn2z2vHv4&&Opx&uh' );
define( 'NONCE_SALT',       't&CRKorL@ ;^F%+iw#pq;NbiX8{BWY#UX 5[<<ay)VkQV?oRd*$GZ)0fS[G09HA:' );

/**#@-*/

/**
 * WordPress database table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 */
$table_prefix = 'wp_';

/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the documentation.
 *
 * @link https://wordpress.org/documentation/article/debugging-in-wordpress/
 */
define( 'WP_DEBUG', false );

/* Add any custom values between this line and the "stop editing" line. */



/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';
